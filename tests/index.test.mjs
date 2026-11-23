// Index in parts, search tiles and the browser side (src/katalog.js), without network or disk: the output of
// baueAusgabe is served through a fetch stub, so the real loading code runs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { baueAusgabe, KOPF, TEIL } from '../crawler/lib/ausgabe.mjs';
import { kodiere, dekodiere, normalisiere, woerter, baueKacheln, suche, kachelDatei, rangfolge } from '../crawler/lib/suchindex.mjs';
import { FELDER, zeile, suchfelder, startauswahl } from '../crawler/publish.mjs';
import { ladeKatalog, beimNachladen, bedarf, hat, hole, filtern, ladeKarte, ladeArt, ladeAlle, aehnliche } from '../src/katalog.js';

/* ---------------- Test data: 1,200 pictures (3 parts), 100 tracks (head only) ---------------- */

const WOERTER = ['holzbrett', 'steinmauer', 'wasserfall', 'gemälde', 'sonnenuntergang', 'kirche'];
const UNTER = ['Holz', 'Stein', 'Wasser', 'Gemälde', 'Sonstiges'];
const hex = (i) => createHash('sha1').update(String(i)).digest('hex');

function eintrag(i, kind) {
  const w = WOERTER[i % WOERTER.length];
  const unter = kind === 'bild' ? UNTER[Math.floor(i / 7) % UNTER.length] : 'Sonstiges';
  return {
    id: `${kind}:${i}`,
    sig: hex(`${kind}${i}`).slice(0, 8).toUpperCase(),
    kind,
    unter,
    title: `${w} Nummer ${i}`,
    tags: [w, i % 3 ? 'natur' : 'stadt'],
    creator: { name: i % 5 ? `Maler ${i % 11}` : 'unbekannt' },
    source: { id: kind === 'bild' ? 'wikimedia' : 'fma', name: kind === 'bild' ? 'Wikimedia Commons' : 'Free Music Archive' },
    license: i % 4 ? { name: 'CC0 1.0', attribution: false } : { name: 'CC BY 4.0', attribution: true },
    downloads: [{ format: kind === 'bild' ? 'jpg' : 'mp3' }],
    preview: { type: kind === 'bild' ? 'image' : 'audio', url: `https://a.example/${i}.mp3`, thumb: `https://c.example/${i}.jpg?utm_source=x&utm_medium=y&w=300` },
    firstSeen: '2026-01-02T00:00:00Z',
  };
}
const ITEMS = [
  ...Array.from({ length: 1200 }, (_, i) => eintrag(i, 'bild')),
  ...Array.from({ length: 100 }, (_, i) => eintrag(i, 'musik')),
].sort((a, b) => (a.sig.slice(-5) < b.sig.slice(-5) ? -1 : 1));

const lizenzgruppe = (l) => (!l.attribution ? 'frei' : l.shareAlike ? 'gleich' : 'nennung');
const aus = baueAusgabe(ITEMS, { arten: ['bild', 'musik', 'video'], felder: FELDER, zeile: (it) => zeile(it), suchfelder, lizenzgruppe });
for (const it of ITEMS) it.indexTeil = aus.teilVon.get(it.id);

const shardVon = (id) => createHash('sha1').update(id).digest('hex').slice(0, 2);
const shards = new Map();
for (const it of ITEMS) { const s = shardVon(it.id); if (!shards.has(s)) shards.set(s, {}); shards.get(s)[it.id] = it; }
const STAND = {
  total: ITEMS.length,
  perKind: { bild: 1200, musik: 100 },
  sources: [{ id: 'wikimedia', name: 'Wikimedia Commons' }, { id: 'fma', name: 'Free Music Archive' }],
  index: aus.index,
};
const DATEIEN = new Map(aus.dateien);
DATEIEN.set('stand.json', STAND);
DATEIEN.set('start.json', { felder: ['art', ...FELDER], zeilen: startauswahl(ITEMS, 30).map((it) => [it.kind, ...zeile(it)]) });
for (const [s, inhalt] of shards) DATEIEN.set(`karten/${s}.json`, inhalt);

let abgerufen = [];
const teilDateien = () => abgerufen.filter((p) => /^index\/\w+\/\d+\.json$/.test(p));
const kopfDateien = () => abgerufen.filter((p) => p.endsWith('kopf.json'));
before(() => {
  globalThis.fetch = async (url) => {
    const pfad = url.replace(/^\/data\//, '');
    abgerufen.push(pfad);
    if (/^index\/\w+\/\d+\.json$/.test(pfad)) await new Promise((ok) => setTimeout(ok, 5)); // parts are slower than heads
    const inhalt = DATEIEN.get(pfad);
    return inhalt === undefined ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => structuredClone(inhalt) };
  };
});
beforeEach(() => { abgerufen = []; });

const trefferVon = (anfrage, filter = () => true) => {
  const ws = [...new Set(woerter(anfrage))];
  return ITEMS.filter((it) => filter(it) && ws.every((w) => suchfelder(it).some(([t]) => woerter(t).some((x) => x.startsWith(w))))).map((it) => it.id).sort();
};
const ids = (liste) => liste.map((o) => o.id).sort();

/* ---------------- Search index ---------------- */

test('Lauflängen-Listen: Rundreise für Folgen, Lücken und Einzelwerte', () => {
  for (const refs of [[], [0], [5], [0, 1, 2, 3], [3, 4, 5, 9, 10, 40], [7, 8, 20, 21, 22, 23, 90]]) {
    assert.deepEqual(dekodiere(kodiere(refs)), refs);
  }
  assert.ok(kodiere(Array.from({ length: 100 }, (_, i) => i + 50)).length <= 2, 'eine Folge ist eine Zahl plus Länge');
});

test('Normalisierung: Umlaute, ß und Akzente fallen weg', () => {
  assert.equal(normalisiere('Gemälde'), 'gemalde');
  assert.equal(normalisiere('Straße'), 'strasse');
  assert.deepEqual(woerter('Café-Bar, 3D!'), ['cafe', 'bar', '3d']);
});

test('Kacheln: bleiben unter dem Budget, Suche findet genau, als Anfang und mit Tippfehler', () => {
  const kacheln = baueKacheln(ITEMS.map((it, ref) => [ref, suchfelder(it)]), 2000);
  assert.ok(kacheln.size > 1, 'bei kleinem Budget entstehen mehrere Kacheln');
  for (const k of kacheln.values()) assert.ok(JSON.stringify(k).length < 2000 * 1.6);
  const schluessel = [...kacheln.keys()];
  const treffer = (q) => [...suche(q, kacheln, schluessel).keys()].map((r) => ITEMS[r].id).sort();
  assert.deepEqual(treffer('gemalde'), trefferVon('gemalde'));
  assert.deepEqual(treffer('sonnenunt'), trefferVon('sonnenunt'));
  assert.deepEqual(treffer('natur kirche'), trefferVon('natur kirche'));
  const tippfehler = treffer('sonnenuntergamg');
  assert.ok(trefferVon('sonnenuntergang').every((id) => tippfehler.includes(id)), 'ein Tippfehler auf 15 Buchstaben stört nicht');
  assert.deepEqual(treffer('zzzzzz'), []);
});

test('Rangfolge: Treffer im Titel stehen vor Treffern in den Tags', () => {
  const titel = { id: 't', title: 'kirche', tags: [], creator: { name: 'x' }, source: { name: 'y' }, unter: 'u', downloads: [] };
  const tag = { ...titel, id: 'g', title: 'etwas', tags: ['kirche'] };
  const kacheln = baueKacheln([[0, suchfelder(tag)], [1, suchfelder(titel)]]);
  assert.deepEqual(rangfolge(suche('kirche', kacheln, [...kacheln.keys()])), [1, 0]);
});

/* ---------------- Output ---------------- */

test('Ausgabe: Teile zu höchstens 500 Zeilen, Kopf mit 240, jede Zeile genau einmal', () => {
  const bild = aus.index.arten.find((a) => a.art === 'bild');
  assert.equal(bild.anzahl, 1200);
  assert.equal(bild.teile.length, Math.ceil(1200 / TEIL));
  assert.equal(bild.kopf, KOPF);
  const musik = aus.index.arten.find((a) => a.art === 'musik');
  assert.equal(musik.kopf, 100, 'eine kleine Art besteht nur aus dem Kopf');
  assert.ok(!aus.index.arten.some((a) => a.art === 'video'), 'leere Arten fehlen im Index');
  const inTeilen = [...DATEIEN.keys()].filter((p) => /^index\/bild\/\d+\.json$/.test(p)).flatMap((p) => DATEIEN.get(p).zeilen.map((z) => z[0]));
  assert.equal(new Set(inTeilen).size, 1200);
  assert.equal(DATEIEN.get('index/bild/kopf.json').zeilen.length, KOPF);
});

test('Zeile: so viele Felder wie FELDER, Tracking-Parameter fehlen, Quellname und Gruppe stehen nicht drin', () => {
  const z = zeile(ITEMS[0]);
  assert.equal(z.length, FELDER.length);
  const fremd = z[FELDER.indexOf('fremd')];
  assert.match(fremd, /^https:\/\/c\.example\/\d+\.jpg\?w=300$/);
  for (const weg of ['art', 'quellname', 'gruppe']) assert.ok(!FELDER.includes(weg));
});

/* ---------------- Browser side ---------------- */

test('Start: Stichprobe mit art, Quellname und Gruppe ergänzt, nichts von den Ordnern geladen', async () => {
  const k = await ladeKatalog();
  assert.equal(k.start.length, 30);
  for (const o of k.start) {
    assert.ok(o.art && o.quellname && o.gruppe, JSON.stringify(o));
    assert.equal(o.m.length, 5);
  }
  assert.deepEqual([...abgerufen].sort(), ['stand.json', 'start.json']);
  assert.equal(bedarf({}), 'start');
  assert.ok(hat(k, 'start'));
  assert.deepEqual(filtern(k, {}).liste, k.start);
});

test('Bedarf: Suche, Ordner, Unterordner, Filter', () => {
  assert.equal(bedarf({ q: ' holz ' }), 's|||holz');
  assert.equal(bedarf({ q: 'holz', art: 'bild', unter: 'Holz' }), 's|bild|Holz|holz');
  assert.equal(bedarf({ art: 'bild' }), 'bild');
  assert.equal(bedarf({ art: 'bild', unter: 'Holz' }), 'bild|Holz');
  assert.equal(bedarf({ art: 'bild', sort: 'name' }), 'bild!');
  assert.equal(bedarf({ lizenz: 'frei' }), 'alle!');
  assert.equal(bedarf({}, true), 'alle');
  assert.equal(bedarf({ sort: 'neu' }, true), 'alle!');
});

test('Ordner ohne Rückruf: hole wartet, bis alles da ist, Reihenfolge gemischt', async () => {
  const k = await ladeKatalog();
  assert.ok(!hat(k, 'bild'));
  await hole(k, 'bild');
  assert.ok(hat(k, 'bild'));
  const { liste, auswahl } = filtern(k, { art: 'bild' });
  assert.equal(liste.length, 1200);
  assert.equal(auswahl, false);
  assert.ok(liste.every((o) => o.art === 'bild' && o.quellname === 'Wikimedia Commons'));
  assert.deepEqual(liste.map((o) => o.m), liste.map((o) => o.m).sort());
  assert.equal(teilDateien().length, 3);
  assert.equal(filtern(k, { art: 'bild', lizenz: 'frei' }).liste.length, ITEMS.filter((it) => it.kind === 'bild' && !it.license.attribution).length);
});

test('Kleine Art ohne Rückruf: nur der Kopf wird geladen', async () => {
  const k = await ladeKatalog();
  await hole(k, 'musik');
  assert.equal(filtern(k, { art: 'musik' }).liste.length, 100);
  assert.deepEqual(kopfDateien(), ['index/musik/kopf.json']);
  assert.equal(teilDateien().length, 0);
});

test('Ordner mit Rückruf: Kopf sofort, Rest im Hintergrund, einmal Bescheid', async () => {
  const k = await ladeKatalog();
  let bescheid;
  const fertig = new Promise((ok) => { bescheid = ok; });
  const gerufen = [];
  beimNachladen(k, (was) => { gerufen.push(was); bescheid(); });
  await hole(k, 'bild');
  assert.ok(hat(k, 'bild'), 'der Kopf genügt');
  assert.equal(filtern(k, { art: 'bild' }).liste.length, KOPF);
  const kopfIds = filtern(k, { art: 'bild' }).liste.map((o) => o.id);
  await fertig;
  assert.deepEqual(gerufen, ['bild']);
  const voll = filtern(k, { art: 'bild' }).liste;
  assert.equal(voll.length, 1200);
  assert.deepEqual(voll.slice(0, KOPF).map((o) => o.id), kopfIds, 'der Kopf bleibt oben, nichts springt');
  assert.equal(new Set(voll.map((o) => o.id)).size, 1200, 'keine doppelten Objekte');
});

test('Filter, die alle Zeilen brauchen, bleiben auch mit Rückruf vollständig', async () => {
  const k = await ladeKatalog();
  beimNachladen(k, () => assert.fail('kein Nachladen nötig'));
  const was = bedarf({ art: 'bild', sort: 'name' });
  assert.equal(was, 'bild!');
  await hole(k, was);
  assert.equal(filtern(k, { art: 'bild', sort: 'name' }).liste.length, 1200);
  assert.ok(hat(k, was));
});

test('Alle Ordner mit Rückruf: Köpfe zuerst, Reihenfolge gemischt über alle Arten', async () => {
  const k = await ladeKatalog();
  const fertig = new Promise((ok) => beimNachladen(k, ok));
  await hole(k, 'alle');
  assert.deepEqual(kopfDateien().sort(), ['index/bild/kopf.json', 'index/musik/kopf.json']);
  const kopfListe = filtern(k, {}, true).liste;
  assert.equal(kopfListe.length, KOPF + 100);
  assert.deepEqual(kopfListe.slice(0, 20).map((o) => o.id), ITEMS.slice(0, 20).map((o) => o.id));
  await fertig;
  assert.equal(filtern(k, {}, true).liste.length, 1300);
});

test('Unterordner: nur die Teile, in denen er liegt', async () => {
  const k = await ladeKatalog();
  const bild = aus.index.arten.find((a) => a.art === 'bild');
  let gespart = false;
  for (const unter of UNTER) {
    abgerufen = [];
    const k2 = await ladeKatalog();
    const was = bedarf({ art: 'bild', unter });
    await hole(k2, was);
    const u = bild.unter.indexOf(unter);
    const deckend = bild.teile.filter((t) => t[1] <= u && u <= t[2]).length;
    assert.equal(teilDateien().length, deckend, unter);
    assert.deepEqual(ids(filtern(k2, { art: 'bild', unter }).liste), ITEMS.filter((it) => it.kind === 'bild' && it.unter === unter).map((it) => it.id).sort());
    if (deckend < bild.teile.length) gespart = true;
  }
  assert.ok(gespart, 'mindestens ein Unterordner kommt mit weniger als allen Teilen aus');
  assert.ok(hat(k, 'bild|Unbekannt'), 'ein Unterordner, den es nicht gibt, ist leer, kein Fehler');
});

test('Suche über alles: genau die Treffer der Brute-Force-Suche, nur die Teile mit Treffern', async () => {
  const k = await ladeKatalog();
  for (const q of ['gemalde', 'wasserfall natur', 'sonnenunt', 'kirche']) {
    abgerufen = [];
    const was = bedarf({ q });
    assert.ok(!hat(k, was));
    await hole(k, was);
    assert.ok(hat(k, was));
    assert.deepEqual(ids(filtern(k, { q }).liste), trefferVon(q), q);
  }
  const k2 = await ladeKatalog();
  abgerufen = [];
  await hole(k2, bedarf({ q: 'xyz' }));
  assert.deepEqual(filtern(k2, { q: 'xyz' }).liste, []);
  assert.equal(teilDateien().length, 0, 'ohne Treffer kein Teil');
});

test('Suche: Tippfehler, Umlaut, Filter und Ordner', async () => {
  const k = await ladeKatalog();
  await hole(k, bedarf({ q: 'gemalde' }));
  assert.ok(filtern(k, { q: 'gemalde' }).liste.length > 0);
  await hole(k, bedarf({ q: 'sonnenuntergamg' }));
  assert.ok(filtern(k, { q: 'sonnenuntergamg' }).liste.length > 0);
  const f = { q: 'natur', art: 'musik', lizenz: 'frei' };
  await hole(k, bedarf(f));
  assert.deepEqual(ids(filtern(k, f).liste), trefferVon('natur', (it) => it.kind === 'musik' && !it.license.attribution));
  const g = { q: 'holzbrett', art: 'bild', unter: 'Holz' };
  await hole(k, bedarf(g));
  assert.deepEqual(ids(filtern(k, g).liste), trefferVon('holzbrett', (it) => it.kind === 'bild' && it.unter === 'Holz'));
});

test('Detailblatt: ladeKarte holt den Indexteil, Ähnliche gibt es danach', async () => {
  const k = await ladeKatalog();
  const it = await ladeKarte('bild:500');
  assert.equal(it.id, 'bild:500');
  assert.ok(k.byId.has('bild:500'));
  assert.equal(teilDateien().length, 1);
  assert.equal(aehnliche(k, k.byId.get('bild:500')).length, 8);
  assert.equal(await ladeKarte('bild:nichtda'), null);
});

test('Kein neues Format, kein Katalog: klarer Fehler', async () => {
  const alt = DATEIEN.get('stand.json');
  DATEIEN.set('stand.json', { ...alt, index: undefined });
  try {
    await assert.rejects(ladeKatalog(), /alte Format/);
  } finally {
    DATEIEN.set('stand.json', alt);
  }
});

test('Ausgabe: Dateinamen der Kacheln stimmen mit dem Index überein', () => {
  for (const s of aus.index.kacheln) assert.ok(DATEIEN.has(`suche/${kachelDatei(s)}`), s);
  assert.equal(aus.index.kacheln.length, [...DATEIEN.keys()].filter((p) => p.startsWith('suche/')).length);
});

test('ladeArt und ladeAlle: Kopf, dann alles', async () => {
  const k = await ladeKatalog();
  assert.equal((await ladeArt(k, 'bild')).length, KOPF);
  assert.equal((await ladeAlle(k)).length, 1300);
});
