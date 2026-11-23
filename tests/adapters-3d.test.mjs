// 3D sources for vehicles (Gazebo Fuel) against a trimmed real API answer, without network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateItem } from '../crawler/lib/schema.mjs';
import { unterkategorie } from '../crawler/lib/taxonomy.mjs';
import fuel, { parseModel as parseFuelModel, nextPage as fuelNextPage, requestUrl as fuelUrl, cloneKey } from '../crawler/sources/fuel.mjs';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const valid = (it) => assert.deepEqual(validateItem(it), [], JSON.stringify(it, null, 1));

const rows = fx('fuel-models');
const row = (owner, name) => rows.find((r) => r.owner === owner && r.name === name);

// --- Gazebo Fuel ------------------------------------------------------------------------------

test('Fuel: Fahrzeug mit CC BY wird 3D-Eintrag mit Vorschaubild und ZIP-Download', () => {
  const it = parseFuelModel(row('yoz', 'Ambulance'));
  valid(it);
  assert.equal(it.id, 'fuel:yoz/Ambulance');
  assert.equal(it.kind, '3d');
  assert.match(it.sig, /^3D·D1·/);
  assert.equal(it.license.id, 'CC-BY-4.0');
  assert.equal(it.creator.name, 'yoz');
  assert.equal(it.source.url, 'https://app.gazebosim.org/yoz/fuel/models/Ambulance');
  assert.equal(it.preview.type, 'image');
  assert.equal(it.preview.thumb, 'https://fuel.gazebosim.org/1.0/yoz/models/Ambulance/tip/files/thumbnails/1.png');
  assert.equal(it.downloads.length, 1);
  assert.equal(it.downloads[0].url, 'https://fuel.gazebosim.org/1.0/yoz/models/Ambulance.zip');
  assert.equal(it.downloads[0].format, 'zip');
  assert.equal(it.downloads[0].size, 514619);
  assert.ok(it.tags.includes('vehicle') && it.tags.includes('gazebo'));
  assert.match(it.attribution, /Lizenz: CC BY 4\.0/);
});

test('Fuel: Leerzeichen im Namen werden in URLs kodiert, im Titel bleiben sie lesbar', () => {
  const it = parseFuelModel(row('Freya', 'Robo Rover'));
  valid(it);
  assert.equal(it.title, 'Robo Rover');
  assert.equal(it.preview.thumb, 'https://fuel.gazebosim.org/1.0/Freya/models/Robo%20Rover/tip/files/thumbnails/1.jpg');
  assert.equal(it.downloads[0].url, 'https://fuel.gazebosim.org/1.0/Freya/models/Robo%20Rover.zip');
  assert.equal(it.source.url, 'https://app.gazebosim.org/Freya/fuel/models/Robo%20Rover');
});

test('Fuel: Unterstriche im Namen werden im Titel zu Leerzeichen', () => {
  assert.equal(parseFuelModel(row('antony', 'Static_Car')).title, 'Static Car');
});

test('Fuel: CC0 braucht keine Namensnennung, CC BY-SA bleibt erhalten', () => {
  const zero = parseFuelModel(row('sorrybro1', 'Fire truck'));
  valid(zero);
  assert.equal(zero.license.id, 'CC0-1.0');
  assert.equal(zero.license.attribution, false);
  const sa = parseFuelModel(row('OpenRobotics', 'Jenolan Section 05 Lights'));
  valid(sa);
  assert.equal(sa.license.id, 'CC-BY-SA-4.0');
  assert.equal(sa.license.shareAlike, true);
});

test('Fuel: NC/ND-Lizenz, fehlendes Vorschaubild und private Modelle fliegen raus', () => {
  const ncnd = row('mohamedazimal27', 'Warehouse');
  assert.match(ncnd.license_name, /Non Commercial No Derivatives/);
  assert.equal(parseFuelModel(ncnd), null);
  assert.equal(parseFuelModel(row('AlexisM', 'Car')), null);
  assert.equal(parseFuelModel({ ...row('yoz', 'Ambulance'), private: true }), null);
  assert.equal(parseFuelModel({ ...row('yoz', 'Ambulance'), license_url: undefined, license_name: 'Proprietary' }), null);
});

test('Fuel: Fahrzeuge landen über die Taxonomie in „Fahrzeuge & Raumfahrt“', () => {
  for (const [owner, name] of [['yoz', 'Ambulance'], ['Freya', 'Robo Rover'], ['antony', 'Static_Car'], ['sorrybro1', 'Fire truck'], ['kvitlich', 'Prius Hybrid']]) {
    const it = parseFuelModel(row(owner, name));
    assert.equal(unterkategorie(it), 'Fahrzeuge & Raumfahrt', `${name} → ${unterkategorie(it)}`);
  }
});

test('Fuel: Seitenzähler hört am Ende der Liste auf', () => {
  assert.equal(fuelNextPage(1, 100, 3472, 100), 2);
  assert.equal(fuelNextPage(35, 72, 3472, 100), null);
  assert.equal(fuelNextPage(35, 100, 3500, 100), null);
  assert.equal(fuelNextPage(3, 0, 3472, 100), null);
  assert.equal(fuelNextPage(2, 100, NaN, 100), 3);
});

test('Fuel: Listen-URL fragt aufsteigend nach Alter', () => {
  assert.equal(fuelUrl(3, 100), 'https://fuel.gazebosim.org/1.0/models?per_page=100&page=3&order=asc');
});

test('Fuel: Kopie = gleicher Name und gleiche Größe bei anderem Besitzer', () => {
  assert.equal(cloneKey(row('antony', 'Static_Car')), cloneKey(row('Antoinedemba93', 'Static_Car')));
  assert.notEqual(cloneKey(row('antony', 'Static_Car')), cloneKey(row('yoz', 'Ambulance')));
});

test('Fuel: crawl liest Seiten, lässt Kopien weg und merkt sich den Stand in der Zustandsdatei', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fundus-fuel-'));
  const stand = join(dir, 'fuel.json');
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const page = Number(new URL(url).searchParams.get('page'));
    // two pages of a list of 11 rows, 8 per page
    const slice = page === 1 ? rows.slice(0, 8) : rows.slice(8);
    return new Response(JSON.stringify(slice), { status: 200, headers: { 'content-type': 'application/json', 'x-total-count': String(rows.length) } });
  };
  try {
    const log = [];
    // per_page is clamped to at least 10, so a page of 8 rows counts as the last page
    const first = await fuel.crawl({ stand, abstandMs: 1, budget: 1, proSeite: 10 }, (m) => log.push(m));
    const ids = first.map((i) => i.id);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /page=1/);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes('fuel:antony/Static_Car'));
    assert.ok(!ids.includes('fuel:Antoinedemba93/Static_Car'), 'Kopie wurde nicht ausgeschlossen');
    assert.ok(!ids.some((i) => i.includes('Warehouse')), 'NC/ND-Modell kam durch');
    for (const it of first) valid(it);
    assert.match(log.join('\n'), /1 Kopien/);
    const saved = JSON.parse(await readFile(stand, 'utf8'));
    assert.equal(saved.version, 1);
    assert.equal(saved.strang.fertig, true);
    assert.equal(saved.gesehen[cloneKey(row('antony', 'Static_Car'))], 'fuel:antony/Static_Car');
    // a second run on the same day: the strand is finished, no new request
    const again = await fuel.crawl({ stand, abstandMs: 1, budget: 5, proSeite: 10 }, () => {});
    assert.equal(again.length, 0);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = real;
    await rm(dir, { recursive: true, force: true });
  }
});

test('Fuel: ausschliessen nimmt ganze Besitzer aus dem Lauf', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fundus-fuel-'));
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(rows), { status: 200, headers: { 'x-total-count': String(rows.length) } });
  try {
    const out = await fuel.crawl({ stand: join(dir, 'fuel.json'), abstandMs: 1, budget: 1, proSeite: 100, ausschliessen: ['OpenRobotics'] }, () => {});
    assert.ok(out.length > 0);
    assert.ok(!out.some((i) => i.creator.name === 'OpenRobotics'));
  } finally {
    globalThis.fetch = real;
    await rm(dir, { recursive: true, force: true });
  }
});
