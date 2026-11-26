// Builds the files the website loads. The catalogue is too big for one file, so the output is split:
//   public/data/stand.json            counts per kind, subcategory, format and source, crawl date
//   public/data/start.json            a mixed sample for the first screen ("Alle Objekte")
//   public/data/index/<art>/kopf.json the first rows of a kind in mixed order (the folder shows them first)
//   public/data/index/<art>/<nn>.json all rows of a kind in parts of 500, ordered by subfolder and tags
//   public/data/suche/k_<key>.json    search tiles: term -> row numbers (crawler/lib/suchindex.mjs)
//   public/data/karten/<xx>.json      full entries, 256 shards by the first two hex digits of sha1(id);
//                                     the detail sheet loads one shard
// Which parts and tiles exist is listed in stand.json under "index" (crawler/lib/ausgabe.mjs).
// Before writing: drop invalid, broken and blocked entries, merge duplicates (same address, same checksum,
// same picture), add subcategory and mini preview.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateItem, KINDS } from './lib/schema.mjs';
import { dedupe, inhaltsDubletten } from './lib/dedupe.mjs';
import { unterkategorie } from './lib/taxonomy.mjs';
import { ladeKatalog } from './lib/store.mjs';
import { SOURCES } from './sources/index.mjs';
import { baueAusgabe } from './lib/ausgabe.mjs';
import { rangwerte, sterne5 } from './lib/bewertung.mjs';
import { beschreibungsWoerter } from './lib/suchindex.mjs';

export const shardVon = (id) => createHash('sha1').update(id).digest('hex').slice(0, 2);
export const STARTGROESSE = 240;
// output folder; --ziel <ordner> writes elsewhere (measurements, tests)
const ZIEL = process.argv.includes('--ziel') ? process.argv[process.argv.indexOf('--ziel') + 1] : 'public/data';

export function publishable(katalog, status, gesperrt = {}) {
  const out = [];
  const skipped = { ungueltig: 0, kaputt: 0, gesperrt: 0 };
  for (const item of katalog.items) {
    if (gesperrt[item.id]) { skipped.gesperrt++; continue; }
    if (validateItem(item).length) { skipped.ungueltig++; continue; }
    if (status[item.id]?.broken) { skipped.kaputt++; continue; }
    const { fetchedAt, ...rest } = item;
    out.push({ ...rest, checkedAt: status[item.id]?.checkedAt });
  }
  return { items: out, skipped };
}

const lizenzgruppe = (l) => (!l.attribution ? 'frei' : l.shareAlike ? 'gleich' : 'nennung');
export const formate = (it) => [...new Set(it.downloads.flatMap((d) => (d.paket ? d.paket.files.map((f) => f.path.split('.').pop()) : [d.format])).filter((f) => f && f.length <= 5).map((f) => f.toLowerCase()).map((f) => ({ jpeg: 'jpg', tiff: 'tif', 'svg+xml': 'svg' })[f] ?? f))];

/**
 * The compact row of the index files. Field order is fixed in FELDER. Not in the row, the site adds them on
 * loading: art (the file belongs to one kind; start.json carries it as first field), quellname (from
 * stand.sources) and gruppe (from stand.index.lizenzgruppen).
 */
export const FELDER = ['id', 'sig', 'unter', 'titel', 'urheber', 'quelle', 'lizenz', 'formate', 'tags', 'vorschau', 'vb', 'vh', 'neu', 'audio', 'sammlung', 'auch', 'text', 'fremd', 'bew', 'pop', 'rang'];
// The last three: bew = [stars out of five, votes, name of the rating source] or null, pop = [count, label] or null,
// rang = the number that orders "empfohlen" (crawler/lib/bewertung.mjs), 0 for entries without rating and popularity.

// utm_* parameters only count clicks for the source; the picture is the same without them
const ohneTracking = (url) => url.replace(/([?&])utm_[a-z]+=[^&#]*/gi, '$1').replace(/[?&]+(?=#|$)/, '').replace(/\?&+/, '?');

/**
 * Small picture at the source for cards that have no mini preview of our own yet. The site loads it only
 * with "Große Vorschauen" switched on and only when the card comes near the screen. Where a source offers
 * several sizes the smallest useful one is chosen; 3D models and HDRIs are a still picture, never the model.
 */
export function kleineFremdvorschau(it) {
  const t = it.preview?.thumb;
  if (!t) return '';
  if (it.source.id === 'ambientcg') return t.replace('512-PNG', '256-PNG');
  if (it.source.id === 'polyhaven') return t.replace(/width=\d+/, 'width=256');
  if (it.source.id === 'wikimedia') return t.replace(/\/\d+px-/, '/330px-');
  return t;
}
export function zeile(it, v = it.vorschau) {
  return [
    it.id,
    it.sig,
    it.unter,
    it.title,
    it.creator.name,
    it.source.id,
    it.license.name,
    formate(it).join(' '),
    it.tags.slice(0, 8).join(' '),
    v?.pfad ?? '',
    v?.b ?? 0,
    v?.h ?? 0,
    (it.firstSeen ?? '').slice(0, 10),
    it.preview.type === 'audio' ? it.preview.url : '',
    it.collection?.name ?? '',
    it.auch?.length ?? 0,
    // entries without a picture show the start of their description in the card
    !v?.pfad && it.description ? it.description.slice(0, 170) : '',
    v?.pfad ? '' : ohneTracking(kleineFremdvorschau(it)),
    sterne5(it.rating) === null ? null : [sterne5(it.rating), it.rating.count, it.rating.source.name],
    it.popularity ? [it.popularity.value, it.popularity.label] : null,
    it.rang ?? 0,
  ];
}

// Names of the kinds in German and English, so "pixel heart icon" or "sunset hdri" find entries whose title does
// not say "icon" or "hdri". Rows of a kind sit next to each other, so each name costs a few bytes in the index.
// Singular only: the search matches plurals itself.
export const ARTNAMEN = {
  bild: 'bild foto photo image picture',
  grafik: 'grafik graphic 2d',
  '3d': '3d model modell',
  textur: 'textur texture material',
  hdri: 'hdri environment umgebung',
  icon: 'icon',
  musik: 'musik music',
  sound: 'sound sfx gerausch',
  schrift: 'schrift font typeface',
  skript: 'skript script code',
  projekt: 'projekt project',
  skill: 'skill',
  video: 'video',
};

/** What the search index knows of an entry, by weight class (crawler/lib/suchindex.mjs). */
export const suchfelder = (it) => [
  [it.title, 0],
  [it.tags.slice(0, 8).join(' '), 1],
  [it.unter, 1],
  [it.creator.name, 2],
  [it.source.name, 2],
  [formate(it).join(' '), 2],
  [ARTNAMEN[it.kind] ?? it.kind, 2],
  [beschreibungsWoerter(it.description), 3],
];

/** Mixed sample for the first screen: round-robin over the kinds, entries with a picture or text first, the best of those first. */
export function startauswahl(items, n = STARTGROESSE) {
  const proArt = new Map();
  for (const it of items) {
    if (!proArt.has(it.kind)) proArt.set(it.kind, []);
    proArt.get(it.kind).push(it);
  }
  for (const liste of proArt.values()) liste.sort((a, b) => Number(Boolean(b.vorschau || b.description)) - Number(Boolean(a.vorschau || a.description)) || (b.rang ?? 0) - (a.rang ?? 0));
  const out = [];
  for (let i = 0; out.length < n; i++) {
    let gefunden = false;
    for (const liste of proArt.values()) {
      if (liste[i] && out.length < n) { out.push(liste[i]); gefunden = true; }
    }
    if (!gefunden) break;
  }
  return out;
}

const mix = (a, b) => (a.sig.slice(-5) < b.sig.slice(-5) ? -1 : 1);

async function main() {
  let status = {};
  let gesperrt = {};
  let vorschau = {};
  const katalog = await ladeKatalog(SOURCES.map((s) => s.id));
  if (!katalog.items.length) console.warn('Der Katalog ist leer: erst "npm run crawl" ausführen. Die Seite zeigt dann einen leeren Katalog.');
  try { status = JSON.parse(await readFile('data/linkstatus.json', 'utf8')); } catch {}
  // Reported entries: { "<id>": "Grund, Datum" }. They stay out until the entry is removed from this file.
  try { gesperrt = JSON.parse(await readFile('data/gesperrt.json', 'utf8')); } catch {}
  try { vorschau = JSON.parse(await readFile('data/vorschauen.json', 'utf8')); } catch {}

  const { items: gueltig, skipped } = publishable(katalog, status, gesperrt);
  // same address at two sources (Commons directly and through Openverse), then same content
  const ohneAdressDoppel = dedupe(gueltig);
  const { items, zusammengefuehrt: inhaltlich } = inhaltsDubletten(ohneAdressDoppel, vorschau);
  const zusammengefuehrt = gueltig.length - ohneAdressDoppel.length + inhaltlich;
  for (const it of items) {
    // Commons categories carry photographer, date and heritage-register lists; those are not topics
    if (it.source.id === 'wikimedia') it.tags = it.tags.filter((t) => !/user:|taken on|taken with|images of|photographs of|monuments in|heritage|(19|20)\d\d|january|february|march|april|may |june|july|august|september|october|november|december|wikidata|location|by country/i.test(t));
    it.unter = unterkategorie(it);
    const v = vorschau[it.id];
    if (v?.pfad) it.vorschau = { pfad: v.pfad, b: v.b, h: v.h };
  }
  rangwerte(items);
  items.sort(mix);

  const perKind = Object.fromEntries(Object.keys(KINDS).map((k) => [k, 0]));
  const perUnter = Object.fromEntries(Object.keys(KINDS).map((k) => [k, {}]));
  const perSource = {};
  const perFormat = {};
  const mitBewertung = Object.fromEntries(Object.keys(KINDS).map((k) => [k, 0]));
  const mitBeliebtheit = Object.fromEntries(Object.keys(KINDS).map((k) => [k, 0]));
  for (const it of items) {
    perKind[it.kind]++;
    if (sterne5(it.rating) !== null) mitBewertung[it.kind]++;
    if (it.popularity) mitBeliebtheit[it.kind]++;
    perUnter[it.kind][it.unter] = (perUnter[it.kind][it.unter] ?? 0) + 1;
    perSource[it.source.id] = (perSource[it.source.id] ?? 0) + 1;
    for (const f of formate(it)) perFormat[f] = (perFormat[f] ?? 0) + 1;
  }
  const sources = SOURCES.map((s) => ({ id: s.id, name: s.name, url: s.url, kinds: s.kinds, terms: s.terms, hinweis: s.hinweis, count: perSource[s.id] ?? 0 }));

  // index parts, search tiles and the block for stand.json (crawler/lib/ausgabe.mjs)
  const { dateien, index, teilVon } = baueAusgabe(items, { arten: Object.keys(KINDS), felder: FELDER, zeile: (it) => zeile(it), suchfelder, lizenzgruppe });
  const shards = new Map();
  for (const it of items) {
    it.indexTeil = teilVon.get(it.id); // the detail sheet loads this part for "similar entries"
    const k = shardVon(it.id);
    if (!shards.has(k)) shards.set(k, {});
    shards.get(k)[it.id] = it;
  }
  dateien.set('start.json', { felder: ['art', ...FELDER], zeilen: startauswahl(items).sort(mix).map((it) => [it.kind, ...zeile(it)]) });
  for (const [k, inhalt] of shards) dateien.set(`karten/${k}.json`, inhalt);

  await rm(ZIEL, { recursive: true, force: true });
  for (const ordner of new Set([...dateien.keys()].map((d) => d.split('/').slice(0, -1).join('/')))) await mkdir(`${ZIEL}/${ordner}`, { recursive: true });
  for (const [pfad, inhalt] of dateien) await writeFile(`${ZIEL}/${pfad}`, JSON.stringify(inhalt));
  await writeFile(
    `${ZIEL}/stand.json`,
    JSON.stringify({ crawledAt: katalog.crawledAt ?? null, total: items.length, zusammengefuehrt, perKind, mitBewertung, mitBeliebtheit, perUnter, perFormat, sources, index }, null, 1),
  );
  const mitBild = items.filter((it) => it.vorschau).length;
  console.log(`Veröffentlicht: ${items.length} Einträge, ${mitBild} mit Vorschaubild, ${zusammengefuehrt} Doppelte zusammengeführt (ausgelassen: ${skipped.ungueltig} ungültig, ${skipped.kaputt} mit toten Links, ${skipped.gesperrt} gesperrt).`);
}

if (process.argv[1]?.endsWith('publish.mjs')) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
