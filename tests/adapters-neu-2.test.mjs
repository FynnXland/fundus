// Freesound and Smithsonian adapters, and the incremental Openverse crawl state (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateItem } from '../crawler/lib/schema.mjs';
import { parseImage, parseAudio, planRequests, applyResult, markDone, listsFromConfig, emptyState } from '../crawler/sources/openverse.mjs';
import freesound, { parseSound, freesoundLicense } from '../crawler/sources/freesound.mjs';
import smithsonian, { parseRecord } from '../crawler/sources/smithsonian.mjs';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const valid = (it) => assert.deepEqual(validateItem(it), [], JSON.stringify(it, null, 1));

// --- Freesound -------------------------------------------------------------------------------

test('Freesound: CC BY mit HQ-Hörprobe als Download, Freesound-Seite als Ursprung', () => {
  const [r] = fx('freesound-search').results;
  const it = parseSound(r);
  valid(it);
  assert.equal(it.kind, 'sound');
  assert.equal(it.id, 'freesound:401275');
  assert.match(it.sig, /^SND·FR·/);
  assert.equal(it.license.id, 'CC-BY-4.0');
  assert.equal(it.source.url, 'https://freesound.org/people/example/sounds/401275/');
  assert.equal(it.preview.url, r.previews['preview-hq-mp3']);
  assert.deepEqual(it.downloads.map((d) => [d.label, d.url]), [['MP3 (Hörprobe in hoher Qualität)', r.previews['preview-hq-mp3']]]);
  assert.equal(it.hashes.md5, r.md5);
});

test('Freesound: CC0 als Deed-URL und als Indexname', () => {
  valid(parseSound(fx('freesound-search').results[1]));
  assert.equal(parseSound(fx('freesound-search').results[1]).license.id, 'CC0-1.0');
  assert.equal(freesoundLicense('Creative Commons 0').id, 'CC0-1.0');
});

test('Freesound: NC, Sampling+, Name ohne Version und Explizites fallen raus', () => {
  const [r] = fx('freesound-search').results;
  assert.equal(parseSound({ ...r, license: 'https://creativecommons.org/licenses/by-nc/4.0/' }), null);
  assert.equal(parseSound({ ...r, license: 'http://creativecommons.org/licenses/sampling+/1.0/' }), null);
  assert.equal(parseSound({ ...r, license: 'Attribution NonCommercial' }), null);
  assert.equal(parseSound({ ...r, license: 'Attribution' }), null);
  assert.equal(parseSound({ ...r, is_explicit: true }), null);
  assert.equal(parseSound({ ...r, previews: {} }), null);
});

test('Freesound: ohne Token keine Anfrage, nur ein Hinweis', async () => {
  const logs = [];
  assert.deepEqual(await freesound.crawl({ suchen: ['rain'] }, (m) => logs.push(m), {}), []);
  assert.match(logs.join('\n'), /FREESOUND_TOKEN fehlt/);
  assert.equal(freesound.code, 'FR');
});

// --- Smithsonian -----------------------------------------------------------------------------

test('Smithsonian: CC0-Bild mit Museumsseite und IDS-Vorschau', () => {
  const it = parseRecord(fx('smithsonian-image'));
  valid(it);
  assert.equal(it.kind, 'bild');
  assert.equal(it.id, 'smithsonian:saam_1994.91.52');
  assert.equal(it.license.id, 'CC0-1.0');
  assert.equal(it.source.url, 'https://americanart.si.edu/collections/search/artwork/?id=34214');
  assert.equal(it.source.name, 'Smithsonian, Smithsonian American Art Museum');
  assert.equal(it.preview.thumb, 'https://ids.si.edu/ids/deliveryService?id=SAAM-1994.91.52_1&max=480');
  assert.equal(it.downloads[0].label, 'JPEG in hoher Auflösung');
  assert.equal(it.meta.abmessung, '3000 × 2090 px');
});

test('Smithsonian: ohne CC0 bei Metadaten oder Medium verworfen', () => {
  const r = fx('smithsonian-image');
  const dn = r.content.descriptiveNonRepeating;
  assert.equal(parseRecord({ ...r, content: { ...r.content, descriptiveNonRepeating: { ...dn, metadata_usage: { access: 'Usage conditions apply' } } } }), null);
  const media = dn.online_media.media.map((m) => ({ ...m, usage: { access: 'Usage conditions apply' } }));
  assert.equal(parseRecord({ ...r, content: { ...r.content, descriptiveNonRepeating: { ...dn, online_media: { media } } } }), null);
});

test('Smithsonian: gesperrte Ursprungsseite führt zum Verwerfen', () => {
  const r = fx('smithsonian-image');
  const dn = { ...r.content.descriptiveNonRepeating, record_link: 'https://collection.cooperhewitt.org/view/objects/asitem/id/30588' };
  assert.equal(parseRecord({ ...r, content: { ...r.content, descriptiveNonRepeating: dn } }), null);
});

test('Smithsonian: 3D-Modell mit GLB ohne Draco als Vorschau, Voyager als Ursprung', () => {
  const it = parseRecord(fx('smithsonian-3d'));
  valid(it);
  assert.equal(it.kind, '3d');
  assert.equal(it.preview.type, 'model');
  assert.match(it.preview.url, /mantis_shrimp-100k-2048_std\.glb$/);
  assert.doesNotMatch(it.preview.url, /draco/);
  assert.match(it.source.url, /^https:\/\/3d-api\.si\.edu\/voyager\/3d_package:/);
  assert.equal(it.downloads[0].format, 'glb');
  assert.ok(it.downloads.every((d) => d.url.startsWith('https://3d-api.si.edu/')));
});

test('Smithsonian: ohne Schlüssel keine Anfrage, nur ein Hinweis', async () => {
  const logs = [];
  assert.deepEqual(await smithsonian.crawl({ bilder: ['lighthouse'] }, (m) => logs.push(m), {}), []);
  assert.match(logs.join('\n'), /SMITHSONIAN_API_KEY fehlt/);
});

// --- Openverse -------------------------------------------------------------------------------

test('Openverse: Parser bleiben kompatibel', () => {
  valid(parseImage(fx('openverse-image')));
  valid(parseAudio(fx('openverse-audio'), 'sound'));
  assert.equal(parseImage({ ...fx('openverse-image'), license: 'by-nc-sa' }), null);
});

const LISTS = listsFromConfig({ bilder: ['a', 'b'], musik: ['m'], sounds: [] });
const HEUTE = '2026-11-23';

test('Openverse-Stand: neue Begriffe starten bei Seite 1, Budget wird reihum verteilt', () => {
  const { state, requests } = planRequests(null, LISTS, { budget: 5, pageSize: 20, heute: HEUTE });
  assert.deepEqual(requests.map((r) => `${r.key}@${r.page}`), ['bilder:a@1', 'bilder:b@1', 'musik:m@1', 'bilder:a@2', 'bilder:b@2']);
  assert.equal(state.begriffe['musik:m'].seite, 1);
});

test('Openverse-Stand: Seitentiefe 240 begrenzt die Planung (anonym 12, mit Schlüssel 5 Seiten)', () => {
  const one = listsFromConfig({ bilder: ['a'] });
  assert.equal(planRequests(null, one, { budget: 100, pageSize: 20, heute: HEUTE }).requests.length, 12);
  assert.equal(planRequests(null, one, { budget: 100, pageSize: 48, heute: HEUTE }).requests.at(-1).page, 5);
});

test('Openverse-Stand: weiter, wo der letzte Lauf aufhörte; am Ende der Seiten fertig', () => {
  let { state } = planRequests(null, LISTS, { budget: 0, pageSize: 20, heute: HEUTE });
  state = applyResult(state, 'bilder:a', { page: 1, pageCount: 2, resultCount: 20 }, 't');
  state = applyResult(state, 'bilder:b', { page: 1, pageCount: 12, resultCount: 0 }, 't');
  assert.equal(state.begriffe['bilder:a'].seite, 2);
  assert.equal(state.begriffe['bilder:b'].fertig, true);
  const { requests } = planRequests(state, LISTS, { budget: 10, pageSize: 20, heute: HEUTE });
  assert.deepEqual(requests.slice(0, 3).map((r) => `${r.key}@${r.page}`), ['musik:m@1', 'bilder:a@2', 'musik:m@2']);
  assert.ok(!requests.some((r) => r.key === 'bilder:b'));
  assert.ok(!requests.some((r) => r.key === 'bilder:a' && r.page > 2));
  state = applyResult(state, 'bilder:a', { page: 2, pageCount: 2, resultCount: 20 }, 't');
  assert.equal(state.begriffe['bilder:a'].fertig, true);
});

test('Openverse-Stand: alle fertig, neuer Zyklus erst am nächsten Tag und nur zu Laufbeginn', () => {
  let { state } = planRequests(null, LISTS, { budget: 0, pageSize: 20, heute: HEUTE });
  for (const k of ['bilder:a', 'bilder:b', 'musik:m']) state = markDone(state, k);
  assert.equal(planRequests(state, LISTS, { budget: 5, pageSize: 20, heute: HEUTE }).requests.length, 0);
  assert.equal(planRequests(state, LISTS, { budget: 5, pageSize: 20, heute: '2026-11-24', restart: false }).requests.length, 0);
  const next = planRequests(state, LISTS, { budget: 5, pageSize: 20, heute: '2026-11-24' });
  assert.equal(next.neuerZyklus, true);
  assert.equal(next.state.zyklus, 2);
  assert.deepEqual(next.requests.slice(0, 3).map((r) => r.page), [1, 1, 1]);
});

test('Openverse-Stand: neuer Begriff verhindert keinen Fortschritt, entfernter zählt nicht mehr', () => {
  let { state } = planRequests(null, LISTS, { budget: 0, pageSize: 20, heute: HEUTE });
  for (const k of ['bilder:a', 'bilder:b']) state = markDone(state, k);
  // "musik:m" removed from the config, all remaining terms done: a new cycle may start.
  const ohneM = listsFromConfig({ bilder: ['a', 'b'] });
  assert.equal(planRequests(state, ohneM, { budget: 2, pageSize: 20, heute: '2026-11-24' }).neuerZyklus, true);
  // A new term joins at page 1 while the old ones keep their place.
  const mitNeu = listsFromConfig({ bilder: ['a', 'b', 'c'] });
  const plan = planRequests(state, mitNeu, { budget: 2, pageSize: 20, heute: '2026-11-24' });
  assert.equal(plan.neuerZyklus, false);
  assert.deepEqual(plan.requests.map((r) => `${r.key}@${r.page}`), ['bilder:c@1', 'bilder:c@2']);
});

test('Openverse-Stand: Wechsel der Seitengröße behält den Versatz', () => {
  const one = listsFromConfig({ bilder: ['a'] });
  const state = { ...emptyState(HEUTE), begriffe: { 'bilder:a': { seite: 7, proSeite: 20, seiten: 12, fertig: false } } };
  // 120 results seen at 20 per page: with 48 per page the next page is 3 (offset 96), still inside 240.
  const plan = planRequests(state, one, { budget: 10, pageSize: 48, heute: HEUTE });
  assert.deepEqual(plan.requests.map((r) => r.page), [3, 4, 5]);
  // Deeper than the new window: done.
  const deep = { ...emptyState(HEUTE), begriffe: { 'bilder:a': { seite: 13, proSeite: 20, fertig: false } } };
  const p2 = planRequests(deep, one, { budget: 10, pageSize: 48, heute: HEUTE });
  assert.equal(p2.requests.length, 0);
  assert.equal(p2.state.begriffe['bilder:a'].fertig, true);
});

test('Openverse-Stand: Planung verändert den gespeicherten Zustand nicht', () => {
  const state = emptyState(HEUTE);
  planRequests(state, LISTS, { budget: 3, pageSize: 20, heute: HEUTE });
  assert.deepEqual(state.begriffe, {});
});
