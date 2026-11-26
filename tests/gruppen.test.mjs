// Groups of entries that belong together (crawler/lib/gruppen.mjs): the keys, the output files, the folder cards in
// the browser (src/katalog.js) and the folded search rows of the MCP core. No network: the output of baueAusgabe is
// served through a fetch stub. Parts of 4 rows, so a group spans several parts.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stamm, schluessel, gemeinsamerName, bildeGruppen, MINDEST } from '../crawler/lib/gruppen.mjs';
import { baueAusgabe } from '../crawler/lib/ausgabe.mjs';
import { FELDER, zeile, suchfelder } from '../crawler/publish.mjs';
import { ladeKatalog, bedarf, hat, hole, filtern, zusammenfassen, gruppeVon } from '../src/katalog.js';
import { erstelleKern } from '../mcp/src/kern.mjs';
import { suchzeilen } from '../mcp/src/werkzeuge.mjs';

/* ---------------- Keys ---------------- */

test('Stamm: Zähler am Ende fallen weg, Jahre, Modellnummern und Dateiendungen nicht', () => {
  const st = (t) => { const r = stamm(t); return r && [r.s, r.zaehler, r.ausdruecklich]; };
  assert.deepEqual(st('Brass Vase 01'), ['brass vase', true, false]);
  assert.deepEqual(st('Barrel_01'), ['barrel', true, false]);
  assert.deepEqual(st('Circus, No. 3'), ['circus, no', true, true]);
  assert.deepEqual(st('Cup from Oliver Wolcott, Jr. Tea Service (2 of 6)'), ['cup from oliver wolcott, jr. tea service', true, true]);
  assert.deepEqual(st('Hours of Queen Isabella: Fol. 12r'), ['hours of queen isabella: fol', true, true]);
  assert.deepEqual(st('Chinese woodcut: Brocade of the Dragon, 3'), ['chinese woodcut: brocade of the dragon', true, true]);
  assert.deepEqual(st('Asio otus - Long-eared Owl XC513606'), ['asio otus - long-eared owl', true, false]);
  assert.deepEqual(st('Ocean waves 2.aiff'), ['ocean waves', true, false]);
  assert.equal(stamm('Paris 1889').zaehler, false, 'ein Jahr ist kein Zähler');
  assert.equal(stamm('Paris (1889)').zaehler, false);
  assert.equal(stamm('Citroën C1').zaehler, false, 'eine Modellbezeichnung ist kein Zähler');
  assert.equal(stamm('Hydracarina2').zaehler, false, 'ohne Trenner kein Zähler');
  assert.equal(stamm('01'), null, 'ohne Buchstaben bleibt nichts');
});

test('Wellcome: nur ausdrückliche Zähler, eine nackte Nummer ist dort eine Signatur', () => {
  const w = (title) => schluessel(e(title, title, { source: 'wellcome', creator: 'Wellcome Collection' }));
  assert.equal(w('Hindi Manuscript 884'), null);
  assert.equal(w('WMS Turkish 19'), null);
  assert.equal(w('Chinese manuscript, number 10i'), null);
  assert.equal(w('Hindi Manuscript 241, folio 2b'), 'reihe|wellcome|bild|Wellcome Collection|hindi manuscript 241, folio');
  assert.equal(w('Daoyin exercises: Intercourse of Dragon and Tiger, Pose 12'), 'reihe|wellcome|bild|Wellcome Collection|daoyin exercises: intercourse of dragon and tiger, pose');
  assert.ok(w('Chinese woodcut: Daoist internal alchemy (12)'));
  assert.ok(schluessel(e('x', 'Hindi Manuscript 884', { source: 'wikimedia' })), 'anderswo zählt die nackte Nummer');
});

test('Name: gemeinsamer Anfang bis zum Wortende, ohne Zählerwort', () => {
  assert.equal(gemeinsamerName(['Brass Vase 01', 'Brass Vase 02', 'Brass Vase 10']), 'Brass Vase');
  assert.equal(gemeinsamerName(['Circus, No. 1', 'Circus, No. 2']), 'Circus');
  assert.equal(gemeinsamerName(['Book of Hours: fol. 1v', 'Book of Hours: fol. 10v']), 'Book of Hours');
  assert.equal(gemeinsamerName(['Wood 001', 'Wood 002']), 'Wood');
  assert.equal(gemeinsamerName(['Album, Leaf 10', 'Album, Leaf 2']), 'Album');
});

const e = (id, title, { source = 'wikimedia', kind = 'bild', creator = 'Anna', collection, unter = 'Sonstiges', vorschau, license = 'CC0 1.0', thumb } = {}) => ({
  id,
  sig: createHash('sha1').update(id).digest('hex').slice(0, 8).toUpperCase(),
  kind,
  unter,
  title,
  tags: ['probe'],
  creator: { name: creator },
  source: { id: source, name: source },
  license: { name: license, attribution: license !== 'CC0 1.0' },
  downloads: [{ format: 'png' }],
  preview: { type: 'image', thumb: thumb ?? `https://quelle.example/${id}.png` },
  ...(collection ? { collection: { id: collection, name: collection === 'game-icons' ? 'game-icons.net' : collection } } : {}),
  ...(vorschau ? { vorschau } : {}),
});

test('Schlüssel und Gruppen: Sammlung je Urheber, Reihe je Quelle, Art und Urheber, Poly Haven ohne Urheber', () => {
  const items = [
    ...[1, 2, 3].map((i) => e(`w:a${i}`, `Kirche ${i}`, { creator: 'Anna' })),
    ...[4, 5].map((i) => e(`w:b${i}`, `Kirche ${i}`, { creator: 'Ben' })), // only two by Ben: no group
    ...[1, 2, 3].map((i) => e(`ph:${i}`, `Brass Vase 0${i}`, { source: 'polyhaven', kind: '3d', creator: i === 1 ? 'Rico' : 'James' })),
    ...[1, 2, 3, 4].map((i) => e(`gi:d${i}`, `Icon D${i}x`, { source: 'gameicons', kind: 'icon', creator: 'Delapouite', collection: 'game-icons' })),
    ...[1, 2, 3].map((i) => e(`gi:l${i}`, `Icon L${i}x`, { source: 'gameicons', kind: 'icon', creator: 'Lorc', collection: 'game-icons' })),
    e('gi:x', 'Icon X', { source: 'gameicons', kind: 'icon', creator: 'Einzeln', collection: 'game-icons' }),
    ...[1, 2, 3].map((i) => e(`tw:${i}`, `Emoji ${i}x`, { source: 'twemoji', kind: 'icon', creator: 'Twitter', collection: 'twemoji' })),
    ...[1, 2, 3].map((i) => e(`c:${i}`, 'Vase', { source: 'cleveland', creator: 'Emile Gallé' })), // same title, no counter
    ...[1, 2, 3].map((i) => e(`u:${i}`, `Button (${i} of 7)`, { source: 'cleveland', creator: 'unbekannt' })),
  ];
  assert.equal(schluessel(items[0]), 'reihe|wikimedia|bild|Anna|kirche');
  assert.equal(schluessel(items[5]), 'reihe|polyhaven|3d||brass vase', 'Poly Haven nummeriert selbst, der Urheber zählt nicht');
  assert.equal(schluessel(items.find((it) => it.id === 'c:1')), null, 'gleicher Titel ohne Zähler gruppiert nicht');
  const g = bildeGruppen(items);
  const namen = [...g.values()].map((x) => `${x.name}:${x.mitglieder.length}`).sort();
  assert.deepEqual(namen, ['Brass Vase:3', 'Button:3', 'Kirche:3', 'game-icons.net: Delapouite:4', 'game-icons.net: Lorc:3', 'twemoji:3'], 'eine Sammlung mit einem Urheber heißt wie die Sammlung');
  assert.ok([...g.values()].every((x) => x.mitglieder.length >= MINDEST));
  const vase = items.find((it) => it.id === 'ph:1');
  assert.match(vase.serie.id, /^3d\.[0-9a-f]{8}$/);
  assert.deepEqual(vase.serie, { id: vase.serie.id, name: 'Brass Vase', anzahl: 3 });
  assert.equal(items.find((it) => it.id === 'w:b4').serie, undefined);
  assert.equal(items.find((it) => it.id === 'gi:x').serie, undefined, 'ein Gestalter mit einem Icon bleibt einzeln');
  // stable ids and no leftovers from an earlier run
  const vorher = vase.serie.id;
  items.find((it) => it.id === 'w:b5').serie = { id: 'alt', name: 'alt', anzahl: 9 };
  bildeGruppen(items);
  assert.equal(vase.serie.id, vorher);
  assert.equal(items.find((it) => it.id === 'w:b5').serie, undefined);
});

/* ---------------- Output, site and MCP on one small catalogue ---------------- */

// 3d: a Poly Haven series of 9 across two subfolders, a series of 3, 6 singles. bild: a series of 3 without own pictures.
const ITEMS = [
  ...Array.from({ length: 9 }, (_, i) => e(`ph:vase_${i + 1}`, `Brass Vase ${String(i + 1).padStart(2, '0')}`, { source: 'polyhaven', kind: '3d', creator: i % 2 ? 'Rico' : 'James', unter: i < 7 ? 'Deko' : 'Küche', vorschau: { pfad: `aa/vase${i + 1}.webp`, b: 320, h: 320 }, license: i === 8 ? 'CC BY 4.0' : 'CC0 1.0' })),
  ...[1, 2, 3].map((i) => e(`ph:barrel_${i}`, `Barrel 0${i}`, { source: 'polyhaven', kind: '3d', creator: 'Jorge', unter: 'Deko' })),
  ...Array.from({ length: 6 }, (_, i) => e(`ph:single_${i}`, `Chair Model ${'ABCDEF'[i]}`, { source: 'polyhaven', kind: '3d', unter: i % 2 ? 'Deko' : 'Küche' })),
  ...[1, 2, 3].map((i) => e(`w:k${i}`, `Kirche ${i}`, { creator: 'Anna', thumb: `https://upload.example/k${i}.jpg?utm_source=x` })),
].sort((a, b) => (a.sig.slice(-5) < b.sig.slice(-5) ? -1 : 1));
const GRUPPEN = bildeGruppen(ITEMS);
const lizenzgruppe = (l) => (!l.attribution ? 'frei' : 'nennung');
const bild = (it) => ({ f: it.preview.thumb.replace(/\?utm_source=x$/, '') });
const AUS = baueAusgabe(ITEMS, { arten: ['3d', 'bild'], felder: FELDER, zeile: (it) => zeile(it), suchfelder, lizenzgruppe, teil: 4, kopf: 4, bild });
const DATEIEN = new Map(AUS.dateien);
DATEIEN.set('stand.json', {
  crawledAt: '2026-11-26T00:00:00.000Z',
  total: ITEMS.length,
  perKind: { '3d': 18, bild: 3 },
  perUnter: { '3d': { Deko: 13, Küche: 5 }, bild: { Sonstiges: 3 } },
  sources: [{ id: 'polyhaven', name: 'Poly Haven', kinds: ['3d'], count: 18 }, { id: 'wikimedia', name: 'Wikimedia Commons', kinds: ['bild'], count: 3 }],
  index: AUS.index,
});
DATEIEN.set('start.json', { felder: ['art', ...FELDER], zeilen: ITEMS.slice(0, 4).map((it) => [it.kind, ...zeile(it)]) });
const vase = ITEMS.find((it) => it.id === 'ph:vase_1').serie;
const barrel = ITEMS.find((it) => it.id === 'ph:barrel_1').serie;
const kirche = ITEMS.find((it) => it.id === 'w:k1').serie;

let abgerufen = [];
before(() => {
  globalThis.fetch = async (url) => {
    const pfad = String(url).replace(/^https:\/\/fundus\.test\/data\//, '').replace(/^\/data\//, '');
    abgerufen.push(pfad);
    const inhalt = DATEIEN.get(pfad);
    return inhalt === undefined
      ? new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
      : new Response(JSON.stringify(inhalt), { status: 200, headers: { 'content-type': 'application/json' } });
  };
});

test('Ausgabe: eine Gruppendatei je Art, Zeilen tragen [id, Größe], Mitglieder liegen beieinander', () => {
  assert.equal(GRUPPEN.size, 3);
  assert.deepEqual(AUS.index.gruppen, { '3d': 2, bild: 1 });
  assert.deepEqual([...AUS.dateien.keys()].filter((p) => p.endsWith('gruppen.json')).sort(), ['index/3d/gruppen.json', 'index/bild/gruppen.json']);
  const g = AUS.dateien.get('index/3d/gruppen.json')[vase.id];
  assert.equal(g.name, 'Brass Vase');
  assert.equal(g.anzahl, 9);
  assert.deepEqual(g.unter, { Deko: 7, Küche: 2 });
  assert.equal(g.urheber, '', 'verschiedene Urheber');
  assert.equal(g.lizenz, '', 'verschiedene Lizenzen');
  assert.equal(g.bilder.length, 4);
  assert.ok(g.bilder.every((b) => b.v && b.b === 320), 'eigene Vorschauen');
  // 7 members in Deko and 2 in Küche, parts of 4: at most 3 + 1 parts
  assert.ok(g.teile.length <= 4, JSON.stringify(g.teile));
  const kg = AUS.dateien.get('index/bild/gruppen.json')[kirche.id];
  assert.deepEqual(kg.bilder.map((b) => b.f).sort(), ['https://upload.example/k1.jpg', 'https://upload.example/k2.jpg', 'https://upload.example/k3.jpg']);
  assert.equal(kg.bilder.length, 3, 'ohne eigene Vorschau die kleinen Bilder der Quelle');
  assert.equal(kg.urheber, 'Anna');
  const zeilen = [...AUS.dateien].filter(([p]) => /^index\/3d\/\d+\.json$/.test(p)).flatMap(([, d]) => d.zeilen);
  const iSerie = FELDER.indexOf('serie');
  assert.deepEqual(zeilen.find((z) => z[0] === 'ph:vase_3')[iSerie], [vase.id, 9]);
  assert.equal(zeilen.find((z) => z[0] === 'ph:single_0')[iSerie], null);
  // the members of one subfolder are one block in index order
  const pos = zeilen.map((z, i) => [z, i]).filter(([z]) => z[iSerie]?.[0] === vase.id && z[2] === 'Deko').map(([, i]) => i);
  assert.equal(pos.at(-1) - pos[0], pos.length - 1, 'lückenlos');
});

test('Seite: Ordner gruppiert lädt die Gruppen mit, eine Karte je Gruppe, Größe im Unterordner', async () => {
  const k = await ladeKatalog();
  assert.equal(bedarf({ art: '3d' }, false, true), '3d+g');
  assert.equal(bedarf({ art: '3d', unter: 'Deko' }, false, true), '3d|Deko+g');
  assert.equal(bedarf({ art: '3d', q: 'vase' }, false, true), 's|3d||vase', 'die Suche gruppiert nie');
  assert.equal(bedarf({}, false, true), 'start', 'die Stichprobe bleibt einzeln');
  assert.equal(bedarf({ art: '3d', serie: vase.id }), `g|${vase.id}`);
  await hole(k, '3d');
  assert.ok(!hat(k, '3d+g'), 'ohne Gruppendatei nicht fertig');
  abgerufen = [];
  await hole(k, '3d+g');
  assert.deepEqual(abgerufen, ['index/3d/gruppen.json']);
  assert.ok(hat(k, '3d+g'));
  const { liste } = filtern(k, { art: '3d' });
  assert.equal(liste.length, 18);
  const karten = zusammenfassen(k, liste, { art: '3d' });
  assert.equal(karten.length, 6 + 2);
  const v = karten.find((c) => c.gruppe?.id === vase.id);
  assert.equal(v.n, 9);
  assert.equal(v.gruppe.name, 'Brass Vase');
  assert.equal(karten.indexOf(v), karten.findIndex((c) => c.o.serie === vase.id), 'die Karte steht beim ersten Mitglied');
  // subfolder: Küche holds two of the vases; the card names the whole group, because opening it shows all nine
  const kueche = zusammenfassen(k, filtern(k, { art: '3d', unter: 'Küche' }).liste, { unter: 'Küche' });
  assert.equal(kueche.find((c) => c.gruppe?.id === vase.id).n, 9);
  // a licence filter counts what is left; one member left is a single card
  const frei = zusammenfassen(k, filtern(k, { art: '3d', lizenz: 'nennung' }).liste, { lizenz: 'nennung' });
  assert.deepEqual(frei.map((c) => [c.o.id, Boolean(c.gruppe)]), [['ph:vase_9', false]]);
});

test('Seite: eine Gruppe öffnen lädt nur ihre Teile, Reihenfolge natürlich', async () => {
  const k = await ladeKatalog();
  abgerufen = [];
  const was = bedarf({ art: '3d', serie: vase.id });
  assert.ok(!hat(k, was));
  await hole(k, was);
  assert.ok(hat(k, was));
  const g = gruppeVon(k, vase.id);
  assert.deepEqual(abgerufen.sort(), ['index/3d/gruppen.json', ...g.teile.map((n) => `index/3d/0${n}.json`)].sort());
  const { liste } = filtern(k, { art: '3d', serie: vase.id, unter: 'Küche' });
  assert.deepEqual(liste.map((o) => o.titel), Array.from({ length: 9 }, (_, i) => `Brass Vase 0${i + 1}`), 'alle Mitglieder, auch aus anderen Unterordnern');
  assert.ok(liste.every((o) => o.serieAnzahl === 9));
});

test('MCP: Suche faltet eine Gruppe in eine Zeile, group listet die Mitglieder', async () => {
  const kern = erstelleKern({ daten: 'https://fundus.test/data', fetch: globalThis.fetch });
  const e1 = await kern.suchen({ q: 'brass vase', limit: 5 });
  assert.equal(e1.treffer.length, 1, 'neun Treffer, eine Zeile');
  assert.equal(e1.treffer[0].hier, 9);
  assert.equal(e1.gefaltet, 8);
  assert.equal(e1.gesamt, 9);
  assert.equal(e1.bis, 9);
  assert.match(suchzeilen(e1.treffer).split('\n')[1], new RegExp(`\\[group ${vase.id.replace('.', '\\.')}: 9 entries, 9 here\\]`));
  // a listing jumps over the block of a group instead of walking it
  const liste = await kern.suchen({ art: '3d', unter: 'Deko', limit: 50 });
  assert.equal(liste.treffer.filter((r) => r.serie === vase.id).length, 1);
  assert.equal(liste.treffer.filter((r) => r.serie === barrel.id).length, 1);
  assert.equal(liste.treffer.length, 2 + 3, 'zwei Gruppen, drei einzelne in Deko');
  // members
  const m = await kern.suchen({ gruppe: vase.id, limit: 50 });
  assert.equal(m.gesamt, 9);
  assert.equal(m.gefaltet, 0);
  assert.deepEqual(m.treffer.map((r) => r.id).sort(), ITEMS.filter((it) => it.serie?.id === vase.id).map((it) => it.id).sort());
  assert.equal(m.gruppe.name, 'Brass Vase');
  assert.equal(suchzeilen(m.treffer).includes('[group'), false, 'in der Gruppe keine Marke');
  assert.equal((await kern.suchen({ gruppe: vase.id, lizenz: 'CC BY 4.0' })).treffer.length, 1);
  await assert.rejects(kern.suchen({ gruppe: '3d.00000000' }), /Unknown group/);
  await assert.rejects(kern.suchen({ gruppe: vase.id, art: 'bild' }), /belongs to kind 3d/);
  // off: every entry
  assert.equal((await kern.suchen({ q: 'brass vase', zusammenfassen: false, limit: 20 })).treffer.length, 9);
  // the runs of groups fold hits without loading their parts
  const laeufe = AUS.dateien.get('index/gruppenbloecke.json');
  assert.ok(laeufe.some(([, n, id]) => id === vase.id && n >= 2));
  const frisch = () => erstelleKern({ daten: 'https://fundus.test/data', fetch: globalThis.fetch });
  const gefaltet = await frisch().suchen({ q: 'brass vase', limit: 5 });
  const offen = await frisch().suchen({ q: 'brass vase', limit: 9, zusammenfassen: false });
  assert.equal(gefaltet.abrufe, 1, 'nur der Teil der ersten Vase');
  assert.ok(offen.abrufe > gefaltet.abrufe);
});
