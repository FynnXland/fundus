// KI-Anbindung (mcp/): core, tools, HTTP and stdio entries, downloads. No network: the site files are built
// from a small excerpt of real entries (mcp/testdaten/eintraege.json) with the same code as publish
// (baueAusgabe, zeile, suchfelder) and served by a fetch stub that answers missing files like a single-page
// host (index.html, status 200). The SDK parts need `npm install` in mcp/; without it they are skipped.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baueAusgabe } from '../crawler/lib/ausgabe.mjs';
import { FELDER, zeile, suchfelder, formate } from '../crawler/publish.mjs';
import { KINDS } from '../crawler/lib/schema.mjs';
import { erstelleKern, vorschauPfad, istWebp, namensnennung, dateienVon, FundusFehler } from '../mcp/src/kern.mjs';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://fundus.test';

let hilfe = null;
try {
  hilfe = await import('../mcp/test/hilfe.mjs');
} catch (err) {
  console.error(`mcp/: Pakete fehlen (cd mcp && npm install), SDK-Tests übersprungen: ${err.message}`);
}
const mitSdk = { skip: hilfe ? false : 'mcp/node_modules fehlt (cd mcp && npm install)' };

/* ---------------- Site files from the excerpt ---------------- */

const eintraege = JSON.parse(await readFile(path.join(wurzel, 'mcp/testdaten/eintraege.json'), 'utf8'));
const lizenzgruppe = (l) => (!l.attribution ? 'frei' : l.shareAlike ? 'gleich' : 'nennung'); // as in publish.mjs
const mix = (a, b) => (a.sig.slice(-5) < b.sig.slice(-5) ? -1 : 1);
const items = [...eintraege].sort(mix);
const byId = new Map(items.map((it) => [it.id, it]));

function baueSite({ teil = 2, kopf = 2 } = {}) {
  const { dateien, index } = baueAusgabe(items, { arten: Object.keys(KINDS), felder: FELDER, zeile: (it) => zeile(it), suchfelder, lizenzgruppe, teil, kopf });
  const perKind = Object.fromEntries(Object.keys(KINDS).map((k) => [k, 0]));
  const perUnter = Object.fromEntries(Object.keys(KINDS).map((k) => [k, {}]));
  const perFormat = {};
  const quellen = new Map();
  for (const it of items) {
    perKind[it.kind]++;
    perUnter[it.kind][it.unter] = (perUnter[it.kind][it.unter] ?? 0) + 1;
    for (const f of formate(it)) perFormat[f] = (perFormat[f] ?? 0) + 1;
    const q = quellen.get(it.source.id) ?? { id: it.source.id, name: it.source.name, url: '', kinds: [], count: 0 };
    if (!q.kinds.includes(it.kind)) q.kinds.push(it.kind);
    q.count++;
    quellen.set(it.source.id, q);
  }
  const dateienText = new Map([...dateien].map(([p, d]) => [p, JSON.stringify(d)]));
  dateienText.set('stand.json', JSON.stringify({ crawledAt: '2026-11-23T00:00:00.000Z', total: items.length, perKind, perUnter, perFormat, sources: [...quellen.values()], index }));
  const shards = new Map();
  for (const it of items) {
    const s = createHash('sha1').update(it.id).digest('hex').slice(0, 2);
    if (!shards.has(s)) shards.set(s, {});
    shards.get(s)[it.id] = it;
  }
  for (const [s, inhalt] of shards) dateienText.set(`karten/${s}.json`, JSON.stringify(inhalt));
  return dateienText;
}

const SPA = () => new Response('<!doctype html><title>Fundus</title>', { status: 200, headers: { 'content-type': 'text/html' } });

/** fetch stub: site data and previews, plus files at sources (quellen: url -> Response factory). */
function stub(site = baueSite(), quellen = new Map()) {
  const log = [];
  const f = async (url) => {
    log.push(url);
    if (url.startsWith(`${SITE}/data/`)) {
      const d = site.get(url.slice(`${SITE}/data/`.length));
      return d ? new Response(d, { headers: { 'content-type': 'application/json' } }) : SPA();
    }
    if (url.startsWith(`${SITE}/vorschau/`)) {
      try {
        return new Response(await readFile(path.join(wurzel, 'mcp/testdaten/vorschau', url.slice(`${SITE}/vorschau/`.length))), { headers: { 'content-type': 'image/webp' } });
      } catch {
        return SPA();
      }
    }
    if (quellen.has(url)) return quellen.get(url)();
    return new Response('not found', { status: 404 });
  };
  return { fetch: f, log };
}

const neuerKern = (opts = {}, s = stub()) => ({ kern: erstelleKern({ daten: `${SITE}/data`, vorschau: `${SITE}/vorschau`, fetch: s.fetch, ...opts }), s });
const ids = (e) => e.treffer.map((r) => r.id).sort();
const erwartet = (fn) => items.filter(fn).map((it) => it.id).sort();

/* ---------------- Core ---------------- */

describe('Kern', () => {
  test('die Kopie der Suche in mcp/src gleicht crawler/lib/suchindex.mjs (sonst: cd mcp && npm run sync)', async () => {
    const [a, b] = await Promise.all([readFile(path.join(wurzel, 'crawler/lib/suchindex.mjs'), 'utf8'), readFile(path.join(wurzel, 'mcp/src/suchindex.mjs'), 'utf8')]);
    assert.equal(b, a);
  });

  test('Vorschaupfad wie crawler/thumbs.mjs', async () => {
    const it = byId.get('wikimedia:88992301');
    assert.equal(await vorschauPfad(it.id), it.vorschau.pfad);
  });

  test('Wortsuche: alle Wörter müssen passen, Zählung exakt, Art grenzt ein', async () => {
    const { kern } = neuerKern();
    const e = await kern.suchen({ q: 'chair' });
    assert.deepEqual(ids(e), erwartet((it) => /chair/i.test(it.title)));
    assert.equal(e.gesamt, 4);
    assert.equal(e.weiter, null);
    assert.equal((await kern.suchen({ q: 'chair', art: 'bild' })).treffer.length, 0);
    const bemalt = await kern.suchen({ q: 'painted chair' });
    assert.equal(bemalt.voll, 1);
    assert.equal(bemalt.treffer[0].id, 'polyhaven:painted_wooden_chair_01');
    assert.equal(bemalt.treffer[0].fehlt, undefined);
    // a row carries what the answer needs
    const r = e.treffer.find((x) => x.id === 'polyhaven:gallinera_chair');
    assert.equal(r.quellname, 'Poly Haven');
    assert.equal(r.gruppe, 'frei');
    assert.equal(r.art, '3d');
  });

  test('Rückfall: unter drei Treffern für alle Wörter folgen Einträge mit den meisten Wörtern, gekennzeichnet', async () => {
    const { kern } = neuerKern();
    // one exact hit, then the other chairs, which lack "painted"
    const e = await kern.suchen({ q: 'painted chair' });
    assert.equal(e.rueckfall, true);
    assert.deepEqual(e.treffer.slice(1).map((r) => r.fehlt), ['painted', 'painted', 'painted']);
    assert.deepEqual(ids(e), erwartet((it) => /chair/i.test(it.title)));
    assert.equal(e.gesamt, 4);
    // nothing matches all words: only partial rows, the missing word named
    const keins = await kern.suchen({ q: 'chair xyzzy' });
    assert.equal(keins.voll, 0);
    assert.deepEqual(ids(keins), erwartet((it) => /chair/i.test(it.title)));
    assert.ok(keins.treffer.every((r) => r.fehlt === 'xyzzy'));
    // kind and subfolder limit the fallback too
    assert.deepEqual(ids(await kern.suchen({ q: 'chair xyzzy', art: 'bild' })), []);
    // three or more full hits: no fallback; one word: no fallback
    const voll = await kern.suchen({ q: 'chair' });
    assert.equal(voll.rueckfall, false);
    assert.equal((await kern.suchen({ q: 'xyzzy' })).rueckfall, false);
    // at least half of the words should match; when no entry reaches that, one word is enough (a list of names)
    assert.deepEqual(ids(await kern.suchen({ q: 'gallinera sheen pretville xyzzy qwertz' })), ['khronos:SheenChair', 'polyhaven:gallinera_chair', 'polyhaven:pretville_street']);
    // a row filter can drop every full hit (four CC0 chairs, none share-alike): the partial hits follow
    const gefiltert = await kern.suchen({ q: 'chair 3d', lizenzgruppe: 'gleich' });
    assert.equal(gefiltert.voll, 4);
    assert.equal(gefiltert.rueckfall, true);
    assert.deepEqual(gefiltert.treffer.map((r) => [r.id, r.fehlt]), [['wikimedia:88992301', 'chair']]);
    // ... and stay behind the full hits that pass the filter
    const frei = await kern.suchen({ q: 'chair 3d', lizenzgruppe: 'frei' });
    assert.deepEqual(frei.treffer.slice(0, 4).map((r) => r.fehlt), [undefined, undefined, undefined, undefined]);
    assert.equal(frei.rueckfall, false, 'no partial hit passes the filter');
  });

  test('Suche findet Beschreibung, Artnamen und Plural', async () => {
    const { kern } = neuerKern();
    // "leads" stands only in the description of the skill
    assert.deepEqual(ids(await kern.suchen({ q: 'leads', art: 'skill' })), ['github:gosom/google-maps-scraper/skills/google-maps-scraper']);
    // the kind name in both languages
    assert.deepEqual(ids(await kern.suchen({ q: 'font' })), erwartet((it) => it.kind === 'schrift'));
    assert.deepEqual(ids(await kern.suchen({ q: 'street hdri' })), ['polyhaven:pretville_street']);
    assert.deepEqual(ids(await kern.suchen({ q: 'musik' })), erwartet((it) => it.kind === 'musik'));
    // plural and singular
    assert.deepEqual(ids(await kern.suchen({ q: 'chairs' })), erwartet((it) => /chair/i.test(it.title)));
    assert.deepEqual(ids(await kern.suchen({ q: 'floors', art: 'textur' })), ['ambientcg:WoodFloor060']);
    // a title hit ranks before a description hit
    const r = await kern.suchen({ q: 'chair' });
    assert.ok(r.treffer.every((x) => /chair/i.test(x.titel)));
  });

  test('Seitenweise mit Cursor: dieselben Treffer, keine doppelt', async () => {
    for (const anfrage of [{ q: 'chair' }, { q: 'painted chair' }, { q: 'chair xyzzy' }, { art: '3d' }, { art: '3d', mitVorschau: true }, {}]) {
      const { kern } = neuerKern();
      const alle = ids(await kern.suchen({ ...anfrage, limit: 50 }));
      const gesammelt = [];
      let cursor;
      do {
        const e = await kern.suchen({ ...anfrage, limit: 1, cursor });
        gesammelt.push(...e.treffer.map((r) => r.id));
        cursor = e.weiter;
      } while (cursor);
      assert.deepEqual(gesammelt.sort(), alle, JSON.stringify(anfrage));
      assert.equal(new Set(gesammelt).size, gesammelt.length);
    }
  });

  test('Filter: Unterordner, Lizenz, Lizenzgruppe, Format, Quelle, Schlagwort, nur mit Vorschau', async () => {
    const { kern } = neuerKern();
    const moebel = await kern.suchen({ art: '3d', unter: 'möbel', limit: 50 });
    assert.deepEqual(ids(moebel), erwartet((it) => it.unter === 'Möbel'));
    assert.equal(moebel.gesamt, 4); // from stand.perUnter
    assert.deepEqual(ids(await kern.suchen({ lizenzgruppe: 'gleich', limit: 50 })), erwartet((it) => it.license.attribution && it.license.shareAlike));
    assert.deepEqual(ids(await kern.suchen({ lizenz: 'cc by-sa 4.0', limit: 50 })), erwartet((it) => it.license.name === 'CC BY-SA 4.0'));
    assert.deepEqual(ids(await kern.suchen({ format: '.stl', limit: 50 })), ['wikimedia:88992301']);
    assert.deepEqual(ids(await kern.suchen({ quelle: 'Poly Haven', limit: 50 })), erwartet((it) => it.source.id === 'polyhaven'));
    assert.deepEqual(ids(await kern.suchen({ tags: ['furniture'], limit: 50 })), erwartet((it) => it.tags.slice(0, 8).includes('furniture')));
    assert.deepEqual(ids(await kern.suchen({ mitVorschau: true, limit: 50 })), erwartet((it) => it.vorschau));
    const kombi = await kern.suchen({ q: 'chair', quelle: 'polyhaven', mitVorschau: true, limit: 50 });
    assert.deepEqual(ids(kombi), ['polyhaven:gallinera_chair', 'polyhaven:painted_wooden_chair_01']);
    assert.equal(kombi.gesamt, null); // not counted with row filters
  });

  test('unbekannte Werte nennen die gültigen', async () => {
    const { kern } = neuerKern();
    await assert.rejects(kern.suchen({ art: 'moebel' }), (e) => e instanceof FundusFehler && /Kinds: .*3d/.test(e.message));
    await assert.rejects(kern.suchen({ art: '3d', unter: 'Stühle' }), (e) => /Subfolders: .*Möbel/.test(e.message));
    await assert.rejects(kern.suchen({ quelle: 'sketchfab' }), FundusFehler);
    await assert.rejects(kern.suchen({ cursor: '-1' }), FundusFehler);
  });

  test('Abrufgrenze: hält an, meldet es und macht mit dem Cursor weiter', async () => {
    const { kern, s } = neuerKern({ maxAbrufe: 1 });
    const e = await kern.suchen({ quelle: 'fontsource', limit: 5 }); // the only font sits in a later part
    assert.equal(e.teilweise, true);
    assert.ok(e.weiter);
    assert.equal(s.log.filter((u) => u.includes('/index/')).length, 1);
    let cursor = e.weiter;
    const gefunden = [...e.treffer];
    for (let i = 0; i < 20 && cursor; i++) {
      const w = await kern.suchen({ quelle: 'fontsource', limit: 5, cursor });
      gefunden.push(...w.treffer);
      cursor = w.weiter;
    }
    assert.deepEqual(gefunden.map((r) => r.id), ['fontsource:protest-revolution']);
  });

  test('Eintrag, eigene Vorschau, fehlende Datei beim Single-Page-Host', async () => {
    const { kern } = neuerKern();
    const it = await kern.eintrag('polyhaven:gallinera_chair');
    assert.equal(it.title, 'Gallinera Chair');
    await assert.rejects(kern.eintrag('polyhaven:gibtsnicht'), /No entry/);
    assert.ok(istWebp(await kern.vorschauBild('polyhaven:gallinera_chair')));
    assert.equal(await kern.vorschauBild('khronos:SheenChair'), null); // index.html with 200 is not a picture
  });

  test('falsches Datenformat wird klar gemeldet', async () => {
    const site = baueSite();
    const stand = JSON.parse(site.get('stand.json'));
    stand.index.version = 1;
    site.set('stand.json', JSON.stringify(stand));
    const { kern } = neuerKern({}, stub(site));
    await assert.rejects(kern.suchen({ q: 'chair' }), /version 1, expected 2/);
    const leer = new Map();
    await assert.rejects(neuerKern({}, stub(leer)).kern.suchen({}), /missing or not JSON/);
  });

  test('Namensnennung und Dateien eines Pakets', () => {
    const it = byId.get('wikimedia:88992301');
    assert.match(namensnennung(it), /OfficialURL.*CC BY-SA 4\.0/);
    assert.match(namensnennung({ ...it, attribution: undefined }), /^„Great enneagrammic prism“ von OfficialURL, https:/);
    const paket = byId.get('polyhaven:gallinera_chair').downloads[0];
    assert.deepEqual(dateienVon(paket).map((f) => f.pfad), paket.paket.files.map((f) => f.path));
    assert.ok(!dateienVon(it.downloads[0])[0].url.includes('utm_'));
  });
});

/* ---------------- MCP tools ---------------- */

async function verbinde(serverOpts, s = stub()) {
  const { kern } = neuerKern({}, s);
  const server = hilfe.baueServer({ kern, ...serverOpts });
  const [a, b] = hilfe.InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new hilfe.Client({ name: 'test', version: '0' });
  await client.connect(b);
  const ruf = async (name, args = {}) => client.callTool({ name, arguments: args });
  const textVon = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  return { client, ruf, textVon };
}

describe('MCP-Werkzeuge', () => {
  test('lokal: sieben Werkzeuge mit Download, entfernt: Links statt Download', mitSdk, async () => {
    const lokal = await verbinde({ herunterladen: async () => '' });
    assert.deepEqual((await lokal.client.listTools()).tools.map((t) => t.name), ['fundus_catalog', 'fundus_search', 'fundus_preview', 'fundus_details', 'fundus_similar', 'fundus_attribution', 'fundus_download']);
    const fern = await verbinde({});
    const tools = (await fern.client.listTools()).tools;
    assert.deepEqual(tools.map((t) => t.name), ['fundus_catalog', 'fundus_search', 'fundus_preview', 'fundus_details', 'fundus_similar', 'fundus_attribution', 'fundus_download_links']);
    assert.ok(tools.every((t) => !t.outputSchema), 'no outputSchema: text only, no doubled tokens');
    // every session reads this list: 6,500 characters with five tools, raised for sort, filters and two more tools
    assert.ok(JSON.stringify(tools).length < 8500, `tool list stays small (${JSON.stringify(tools).length})`);
  });

  test('Suche antwortet knapp als Tabelle mit Cursor', mitSdk, async () => {
    const { ruf, textVon } = await verbinde({});
    const t = textVon(await ruf('fundus_search', { query: 'chair', limit: 2 }));
    const zeilen = t.split('\n');
    assert.match(zeilen[0], /^4 matches for "chair", showing 1-2\. More: cursor "2"\.$/);
    assert.equal(zeilen[1], 'id\ttitle\tkind/subfolder\tlicense\tformats\tsource\tcreator\tpreview');
    assert.equal(zeilen.length, 4);
    assert.ok(t.length < 600);
    const weiter = textVon(await ruf('fundus_search', { query: 'chair', limit: 2, cursor: '2' }));
    assert.match(weiter, /showing 3-4\./);
    // a subfolder: the count is known, the position is not the match number (rows of other subfolders skipped)
    assert.match(textVon(await ruf('fundus_search', { kind: '3d', subfolder: 'Möbel', limit: 2 })), /^4 matches in 3d, 2 on this page\. More: cursor/);
    // fallback: the header says so, the last column names the missing words
    const teil = textVon(await ruf('fundus_search', { query: 'painted chair', limit: 3 })).split('\n');
    assert.match(teil[0], /^1 match for all words of "painted chair", then 3 matching only some words \(column "missing"\), showing 1-3\. More: cursor "3"\.$/);
    assert.ok(teil[1].endsWith('\tpreview\tmissing'));
    assert.ok(teil[2].endsWith('\t-'));
    assert.ok(teil[3].endsWith('\tpainted'));
    assert.match(textVon(await ruf('fundus_search', { query: 'chair xyzzy', limit: 2 })), /^No entry matches all words of "chair xyzzy"\. Showing 4 entries matching some words/);
    assert.match(textVon(await ruf('fundus_search', { query: 'chair 3d', license_group: 'gleich' })), /^No entry on this page matches all words of "chair 3d" with these filters; showing entries matching only some words \(column "missing"\)\.\n/);
    const fehler = await ruf('fundus_search', { kind: 'moebel' });
    assert.equal(fehler.isError, true);
    assert.match(textVon(fehler), /Kinds:/);
  });

  test('Katalog nennt Arten, Lizenzgruppen, Quellen und Unterordner', mitSdk, async () => {
    const { ruf, textVon } = await verbinde({});
    const t = textVon(await ruf('fundus_catalog'));
    assert.match(t, /13 entries/);
    assert.match(t, /3d 5/);
    assert.match(t, /polyhaven=Poly Haven 4/);
    assert.match(textVon(await ruf('fundus_catalog', { kind: '3d' })), /Möbel \(4\)/);
  });

  test('Details: Lizenz, Namensnennung, Quelle, Downloads mit Größe', mitSdk, async () => {
    const { ruf, textVon } = await verbinde({});
    const t = textVon(await ruf('fundus_details', { ids: ['wikimedia:88992301', 'polyhaven:gallinera_chair', 'gibt:es-nicht'] }));
    assert.match(t, /License: CC BY-SA 4\.0 https:\/\/creativecommons.org\/licenses\/by-sa\/4\.0\/deed\.de · attribution required, share-alike/);
    assert.match(t, /Attribution: „Great enneagrammic prism“ von OfficialURL/);
    assert.match(t, /1\. STL-Datei \(3D-Modell\) · stl · 4 KB · https:\/\/upload\.wikimedia\.org\/.*\.stl$/m);
    assert.match(t, /1\. glTF-Paket \(2K-Texturen\) · 4 files · 7\.4 MB$/m);
    assert.match(t, /No entry with id "gibt:es-nicht"/);
    assert.ok(t.length < 2500);
  });

  test('Vorschau: Kontaktbogen als ein WebP mit kleinen Zellen, fehlende mit Quell-Link', mitSdk, async () => {
    const codec = await hilfe.nodeCodec();
    const { ruf, textVon } = await verbinde({ codec });
    const r = await ruf('fundus_preview', { ids: ['polyhaven:gallinera_chair', 'wikimedia:88992301', 'polyhaven:painted_wooden_chair_01', 'khronos:SheenChair'] });
    const bilder = r.content.filter((c) => c.type === 'image');
    assert.equal(bilder.length, 1);
    assert.equal(bilder[0].mimeType, 'image/webp');
    const bild = await codec.decode(new Uint8Array(Buffer.from(bilder[0].data, 'base64')).buffer);
    assert.deepEqual([bild.width, bild.height], [3 * 160 + 4 * 4, 120 + 2 * 4]);
    const t = textVon(r);
    assert.match(t, /^1 = polyhaven:gallinera_chair$/m);
    assert.match(t, /^3 = polyhaven:painted_wooden_chair_01$/m);
    assert.match(t, /khronos:SheenChair: no own preview; source thumbnail: https:\/\//);
    // single: the original 320 px file, unchanged
    const einzeln = await ruf('fundus_preview', { ids: ['wikimedia:88992301'], layout: 'single' });
    const datei = await readFile(path.join(wurzel, 'mcp/testdaten/vorschau', byId.get('wikimedia:88992301').vorschau.pfad));
    assert.equal(einzeln.content[1].data, datei.toString('base64'));
    // without codec (e.g. Worker on the free plan) the sheet falls back to single pictures
    const ohne = await verbinde({});
    const r2 = await ohne.ruf('fundus_preview', { ids: ['polyhaven:gallinera_chair', 'wikimedia:88992301'] });
    assert.equal(r2.content.filter((c) => c.type === 'image').length, 2);
  });

  test('Download-Links (entfernt): Paketdateien mit Pfaden und Namensnennung', mitSdk, async () => {
    const { ruf, textVon } = await verbinde({});
    const t = textVon(await ruf('fundus_download_links', { id: 'polyhaven:gallinera_chair' }));
    assert.match(t, /Attribution \(save as a text file next to the files\): „Gallinera Chair“/);
    assert.match(t, /^gallinera_chair_2k\.gltf\thttps:\/\/dl\.polyhaven\.org\//m);
    assert.equal(t.split('\n').filter((z) => z.includes('\thttps://')).length, 4);
    const r = await ruf('fundus_download_links', { id: 'wikimedia:88992301', download: 3 });
    assert.equal(r.isError, true);
  });
});

/* ---------------- HTTP (Worker, Pages Function) ---------------- */

async function lies(res) {
  const typ = res.headers.get('content-type') ?? '';
  const body = await res.text();
  if (typ.includes('text/event-stream')) return body.split('\n').filter((z) => z.startsWith('data:')).map((z) => JSON.parse(z.slice(5)));
  return body ? [JSON.parse(body)] : [];
}

describe('HTTP-Zugang', () => {
  test('alte Clients (Protokoll 2025-06-18) werden ohne Sitzung bedient', mitSdk, async () => {
    const { kern } = neuerKern();
    const http = hilfe.erstelleHttp({ kern });
    const post = (body) => http(new Request(`${SITE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }, body: JSON.stringify(body) }));
    const init = await lies(await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'alt', version: '1' } } }));
    assert.equal(init[0].result.serverInfo.name, 'fundus');
    assert.match(init[0].result.instructions, /fundus_preview for up to 6 ids/);
    const liste = await lies(await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));
    assert.ok(liste[0].result.tools.some((t) => t.name === 'fundus_download_links'));
    const ruf = await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'fundus_search', arguments: { query: 'prism' } } });
    assert.equal(ruf.headers.get('access-control-allow-origin'), '*');
    const antwort = await lies(ruf);
    assert.match(antwort[0].result.content[0].text, /wikimedia:88992301/);
    const vorab = await http(new Request(`${SITE}/mcp`, { method: 'OPTIONS' }));
    assert.equal(vorab.status, 204);
  });

  test('aktueller Client über Streamable HTTP', mitSdk, async () => {
    const { kern } = neuerKern();
    const http = hilfe.erstelleHttp({ kern });
    const transport = new hilfe.StreamableHTTPClientTransport(new URL(`${SITE}/mcp`), { fetch: (u, init) => http(new Request(u, init)) });
    const client = new hilfe.Client({ name: 'neu', version: '1' });
    await client.connect(transport);
    const r = await client.callTool({ name: 'fundus_details', arguments: { ids: ['polyhaven:pretville_street'] } });
    assert.match(r.content[0].text, /Pretville Street/);
    await client.close();
  });
});

/* ---------------- stdio ---------------- */

test('stdio: alter Handshake über echte Pipes, stdout nur Protokoll, ohne Netz', mitSdk, async () => {
  const kind = spawn(process.execPath, [path.join(wurzel, 'mcp/src/stdio.mjs')], { env: { ...process.env, FUNDUS_URL: 'http://127.0.0.1:9' }, stdio: ['pipe', 'pipe', 'pipe'] });
  const antworten = new Map();
  const fremd = [];
  let rest = '';
  kind.stdout.on('data', (d) => {
    rest += d;
    let i;
    while ((i = rest.indexOf('\n')) >= 0) {
      const z = rest.slice(0, i).trim();
      rest = rest.slice(i + 1);
      if (!z) continue;
      try { const m = JSON.parse(z); if (m.id != null) antworten.set(m.id, m); } catch { fremd.push(z); }
    }
  });
  const senden = (m) => kind.stdin.write(`${JSON.stringify(m)}\n`);
  const warte = async (id) => { for (let i = 0; i < 200 && !antworten.has(id); i++) await new Promise((r) => setTimeout(r, 25)); return antworten.get(id); };
  try {
    senden({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'alt', version: '1' } } });
    assert.equal((await warte(1))?.result?.protocolVersion, '2025-06-18');
    senden({ jsonrpc: '2.0', method: 'notifications/initialized' });
    senden({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    assert.deepEqual((await warte(2)).result.tools.map((t) => t.name), ['fundus_catalog', 'fundus_search', 'fundus_preview', 'fundus_details', 'fundus_similar', 'fundus_attribution', 'fundus_download']);
    senden({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'fundus_catalog', arguments: {} } });
    const r = await warte(3);
    assert.equal(r.result.isError, true);
    assert.match(r.result.content[0].text, /not reachable/);
    assert.deepEqual(fremd, []);
  } finally {
    kind.kill();
  }
});

/* ---------------- Download ---------------- */

describe('Download (lokal)', () => {
  const bytes = (n) => new Uint8Array(n).fill(7);
  const quellenFuer = (it, nr, antwort = () => new Response(bytes(100))) => new Map(dateienVon(it.downloads[nr - 1]).map((f) => [f.url, antwort]));

  test('Paket: Ordnerstruktur, LIZENZ.txt, vorhandene Dateien bleiben', mitSdk, async () => {
    const it = byId.get('polyhaven:gallinera_chair');
    const s = stub(baueSite(), quellenFuer(it, 1));
    const laden = hilfe.erstelleDownloader({ fetch: s.fetch });
    const ziel = await mkdtemp(path.join(tmpdir(), 'fundus-test-'));
    try {
      const t = await laden({ it, nr: 1, ziel, maxMb: 500, ueberschreiben: false });
      assert.match(t, /4 file\(s\), 400 B/);
      const ordner = path.join(ziel, it.downloads[0].paket.name);
      const dateien = (await readdir(ordner, { recursive: true })).map((f) => f.replace(/\\/g, '/')).sort();
      assert.deepEqual(dateien, ['LIZENZ.txt', ...it.downloads[0].paket.files.map((f) => f.path), 'textures'].sort());
      const lizenz = await readFile(path.join(ordner, 'LIZENZ.txt'), 'utf8');
      assert.match(lizenz, /Lizenz: CC0 1\.0/);
      assert.match(lizenz, /Quelle: https:\/\/polyhaven\.com\/a\/gallinera_chair/);
      assert.match(lizenz, /Keine Namensnennung vorgeschrieben/);
      const zweiter = await laden({ it, nr: 1, ziel, maxMb: 500, ueberschreiben: false });
      assert.match(zweiter, /0 file\(s\).*4 already there/);
      // honest User-Agent, no Referer
      assert.ok(s.log.length >= 4);
    } finally {
      await rm(ziel, { recursive: true, force: true });
    }
  });

  test('Einzeldatei mit .lizenz.txt; Größengrenze; 403 wird respektiert', mitSdk, async () => {
    const stl = byId.get('wikimedia:88992301');
    let aufrufe = 0;
    const s = stub(baueSite(), quellenFuer(stl, 1, () => { aufrufe++; return new Response(bytes(3684)); }));
    const ziel = await mkdtemp(path.join(tmpdir(), 'fundus-test-'));
    try {
      const t = await hilfe.erstelleDownloader({ fetch: s.fetch })({ it: stl, nr: 1, ziel, maxMb: 1, ueberschreiben: false });
      assert.match(t, /Great_enneagrammic_prism\.stl/);
      assert.deepEqual((await readdir(ziel)).sort(), ['Great_enneagrammic_prism.stl', 'Great_enneagrammic_prism.stl.lizenz.txt']);
      assert.match(await readFile(path.join(ziel, 'Great_enneagrammic_prism.stl.lizenz.txt'), 'utf8'), /Namensnennung mitgeben|Namensnennung oben mitgeben/);
      const gross = byId.get('polyhaven:gallinera_chair');
      await assert.rejects(hilfe.erstelleDownloader({ fetch: s.fetch })({ it: gross, nr: 1, ziel, maxMb: 1, ueberschreiben: false }), /7\.4 MB, above max_mb 1/);
      const gesperrt = stub(baueSite(), quellenFuer(stl, 1, () => { aufrufe++; return new Response('nope', { status: 403 }); }));
      aufrufe = 0;
      await assert.rejects(hilfe.erstelleDownloader({ fetch: gesperrt.fetch })({ it: stl, nr: 1, ziel, maxMb: 1, ueberschreiben: true }), /refused the download \(HTTP 403\)/);
      assert.equal(aufrufe, 1, 'no retry after 403');
    } finally {
      await rm(ziel, { recursive: true, force: true });
    }
  });

  test('gleicher Dateiname, anderer Eintrag: nichts wird überschrieben, Lizenz passt zur Datei', mitSdk, async () => {
    const a = byId.get('wikimedia:88992301');
    const b = structuredClone(a);
    b.id = 'wikimedia:anderer';
    b.title = 'Anderer Eintrag';
    b.attribution = '„Anderer Eintrag“ von Jemand';
    const url = dateienVon(a.downloads[0])[0].url;
    let n = 0;
    const s = stub(baueSite(), new Map([[url, () => new Response(bytes(10 + n++))]]));
    const laden = hilfe.erstelleDownloader({ fetch: s.fetch });
    const ziel = await mkdtemp(path.join(tmpdir(), 'fundus-test-'));
    try {
      await laden({ it: a, nr: 1, ziel, maxMb: 1, ueberschreiben: false });
      const t = await laden({ it: b, nr: 1, ziel, maxMb: 1, ueberschreiben: false });
      const kurz = createHash('sha1').update(b.id).digest('hex').slice(0, 6);
      assert.match(t, new RegExp(`Great_enneagrammic_prism_${kurz}\\.stl`));
      assert.match(await readFile(path.join(ziel, 'Great_enneagrammic_prism.stl.lizenz.txt'), 'utf8'), /Fundus-ID: wikimedia:88992301\n/);
      assert.match(await readFile(path.join(ziel, `Great_enneagrammic_prism_${kurz}.stl.lizenz.txt`), 'utf8'), /Anderer Eintrag[\s\S]*Fundus-ID: wikimedia:anderer\n/);
      // the same entry again finds its own file
      assert.match(await laden({ it: b, nr: 1, ziel, maxMb: 1, ueberschreiben: false }), /1 already there/);
      await assert.rejects(laden({ it: a, nr: 1, ziel: 'relativ/ordner', maxMb: 1, ueberschreiben: false }), /absolute path/);
    } finally {
      await rm(ziel, { recursive: true, force: true });
    }
  });

  test('Pfade aus den Daten können den Zielordner nicht verlassen', mitSdk, async () => {
    for (const p of ['../x.txt', 'a/../../x', '/etc/passwd', 'C:/Windows/x', '..\\x']) assert.throws(() => hilfe.sichererPfad(p), FundusFehler, p);
    assert.equal(hilfe.sichererPfad('textures/a:b.jpg'), path.join('textures', 'a_b.jpg'));
    const it = structuredClone(byId.get('polyhaven:gallinera_chair'));
    it.downloads[0].paket.files[1].path = '../../boese.txt';
    const s = stub();
    await assert.rejects(hilfe.erstelleDownloader({ fetch: s.fetch })({ it, nr: 1, ziel: tmpdir(), maxMb: 500, ueberschreiben: false }), /unsafe path/);
    assert.equal(s.log.length, 0, 'nothing fetched');
  });
});

test('Suche: beliebte Einträge steigen, ein Beschreibungstreffer überholt keinen Titeltreffer', async () => {
  const { baueAusgabe } = await import('../crawler/lib/ausgabe.mjs');
  const { erstelleKern, BONUS } = await import('../mcp/src/kern.mjs');
  const eintrag = (id, titel, tags, rang, text = '') => ({ id, sig: `PRJ·GH·${id.padStart(5, '0')}`, kind: 'projekt', unter: 'Spiele', title: titel, tags, description: text, rang, license: { name: 'MIT' }, popularity: rang ? { value: rang, label: 'GitHub-Sterne' } : undefined });
  const items = [
    eintrag('klein', 'game-engine-2d', [], 0),
    eintrag('gross', 'godot', ['game', 'engine'], 19000),
    eintrag('text', 'riesig', [], 19999, 'a game engine of sorts'),
    ...Array.from({ length: 40 }, (_, i) => eintrag(`f${i}`, `filler ${i}`, [], 0)),
  ];
  const felder = ['id', 'sig', 'unter', 'titel', 'pop', 'serie'];
  const { dateien, index } = baueAusgabe(items, {
    arten: ['projekt'], felder, lizenzgruppe: () => 'nennung',
    zeile: (it) => [it.id, it.sig, it.unter, it.title, it.popularity ? [it.popularity.value, it.popularity.label] : null, null],
    suchfelder: (it) => [[it.title, 0], [it.tags.join(' '), 1], [it.description, 3]],
  });
  assert.equal(index.arten[0].beste, 2, 'nur Einträge mit Rang stehen in beste.json');
  dateien.set('stand.json', { crawledAt: 'x', total: items.length, perKind: { projekt: items.length }, perUnter: { projekt: { Spiele: items.length } }, sources: [], index });
  const holen = async (url) => { const d = dateien.get(new URL(url).pathname.replace(/^\/data\//, '')); return d === undefined ? new Response('', { status: 404 }) : new Response(JSON.stringify(d)); };
  const e = await erstelleKern({ daten: 'http://x/data', fetch: holen }).suchen({ q: 'game engine', art: 'projekt', limit: 5 });
  const ids = e.treffer.map((r) => r.id);
  // tags 2 + 2, times up to 1 + BONUS for the most popular, beats the unknown repository with both words in its name (3 + 3)
  assert.ok(BONUS >= 0.5);
  assert.deepEqual(ids.slice(0, 2), ['gross', 'klein']);
  // description only: 0.5 + 0.5, even at the very top of popularity it stays behind the title match
  assert.equal(ids[2], 'text');
});

test('Suche: Sprache, Mindestbeliebtheit und Sortierung nach Beliebtheit; ähnliche Einträge', async () => {
  const { baueAusgabe } = await import('../crawler/lib/ausgabe.mjs');
  const { erstelleKern } = await import('../mcp/src/kern.mjs');
  const { sprachTag } = await import('../crawler/publish.mjs');
  const eintrag = (id, titel, tags, sterne, sprache) => ({ id, sig: `PRJ·GH·${id.padStart(5, '0')}`, kind: 'projekt', unter: 'Werkzeuge', title: titel, tags: [sprachTag(sprache), ...tags], description: '', rang: sterne, license: { name: 'MIT' }, popularity: { value: sterne, label: 'GitHub-Sterne' }, firstSeen: sterne > 500 ? '2026-11-27' : '2026-10-01' });
  const items = [
    eintrag('a', 'pdf tool', ['pdf', 'parser'], 100, 'Rust'),
    eintrag('b', 'pdf reader', ['pdf', 'viewer'], 5000, 'Python'),
    eintrag('c', 'pdf kit', ['pdf', 'parser'], 900, 'Jupyter Notebook'),
    eintrag('d', 'image kit', ['image'], 20000, 'Rust'),
  ];
  const felder = ['id', 'sig', 'unter', 'titel', 'tags', 'neu', 'pop', 'rang', 'serie'];
  const shard = Object.fromEntries(items.map((it) => [it.id, { ...it, indexTeil: 0, source: { id: 'github', name: 'GitHub', url: 'https://github.com/x/y' } }]));
  const { dateien, index } = baueAusgabe(items, {
    arten: ['projekt'], felder, lizenzgruppe: () => 'nennung',
    zeile: (it) => [it.id, it.sig, it.unter, it.title, it.tags.join(' '), it.firstSeen, [it.popularity.value, it.popularity.label], it.rang, null],
    suchfelder: (it) => [[it.title, 0], [it.tags.join(' '), 1]],
  });
  dateien.set('stand.json', { crawledAt: 'x', total: items.length, perKind: { projekt: items.length }, perUnter: { projekt: { Werkzeuge: items.length } }, sources: [], index: { ...index, karten: 1 } });
  const holen = async (url) => {
    const pfad = new URL(url).pathname.replace(/^\/data\//, '');
    const d = pfad.startsWith('karten/') ? shard : dateien.get(pfad);
    return d === undefined ? new Response('', { status: 404 }) : new Response(JSON.stringify(d));
  };
  const kern = erstelleKern({ daten: 'http://x/data', fetch: holen });
  const ids = async (o) => (await kern.suchen({ art: 'projekt', ...o })).treffer.map((r) => r.id);
  assert.deepEqual(await ids({ q: 'pdf', sprache: 'rust' }), ['a']);
  assert.deepEqual(await ids({ q: 'pdf', sprache: 'Jupyter Notebook' }), ['c'], 'Leerzeichen im Namen der Sprache');
  assert.deepEqual(await ids({ q: 'pdf', minBeliebt: 800 }), ['b', 'c']);
  assert.deepEqual(await ids({ q: 'pdf', seit: '2026-11-01' }), ['b', 'c']);
  assert.deepEqual(await ids({ sortierung: 'popular' }), ['d', 'b', 'c', 'a'], 'ohne Suchwort: die beliebtesten der Art');
  assert.deepEqual(await ids({ q: 'pdf', sortierung: 'popular' }), ['b', 'c', 'a']);
  await assert.rejects(() => kern.suchen({ sortierung: 'popular' }), /needs a kind/);
  // c shares two tags with a; d and b share one each, the more popular of them first
  assert.deepEqual((await kern.aehnliche('a')).map((r) => r.id), ['c', 'd', 'b']);
});
