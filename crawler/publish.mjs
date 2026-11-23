// Builds the files the website loads. The catalogue is too big for one file, so the output is split:
//   public/data/stand.json            counts per kind, subcategory, format and source, crawl date
//   public/data/start.json            a mixed sample for the first screen ("Alle Objekte")
//   public/data/index/<art>.json      one compact row per entry of that kind: grid, search, filters
//   public/data/karten/<xx>.json      full entries, 256 shards by the first two hex digits of sha1(id);
//                                     the detail sheet loads one shard
// Before writing: drop invalid, broken and blocked entries, merge duplicates (same address, same checksum,
// same picture), add subcategory and mini preview.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateItem, KINDS } from './lib/schema.mjs';
import { dedupe, inhaltsDubletten } from './lib/dedupe.mjs';
import { unterkategorie } from './lib/taxonomy.mjs';
import { ladeKatalog } from './lib/store.mjs';
import { SOURCES } from './sources/index.mjs';

export const shardVon = (id) => createHash('sha1').update(id).digest('hex').slice(0, 2);
export const STARTGROESSE = 240;

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

/** The compact row of the index files. Field order is fixed in FELDER. */
export const FELDER = ['id', 'sig', 'art', 'unter', 'titel', 'urheber', 'quelle', 'quellname', 'lizenz', 'gruppe', 'formate', 'tags', 'vorschau', 'vb', 'vh', 'neu', 'audio', 'sammlung', 'auch', 'text', 'fremd'];

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
export function zeile(it, v) {
  return [
    it.id,
    it.sig,
    it.kind,
    it.unter,
    it.title,
    it.creator.name,
    it.source.id,
    it.source.name,
    it.license.name,
    lizenzgruppe(it.license),
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
    v?.pfad ? '' : kleineFremdvorschau(it),
  ];
}

/** Mixed sample for the first screen: round-robin over the kinds, entries with a picture or text first. */
export function startauswahl(items, n = STARTGROESSE) {
  const proArt = new Map();
  for (const it of items) {
    if (!proArt.has(it.kind)) proArt.set(it.kind, []);
    proArt.get(it.kind).push(it);
  }
  for (const liste of proArt.values()) liste.sort((a, b) => Number(Boolean(b.vorschau || b.description)) - Number(Boolean(a.vorschau || a.description)));
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
  items.sort(mix);

  const perKind = Object.fromEntries(Object.keys(KINDS).map((k) => [k, 0]));
  const perUnter = Object.fromEntries(Object.keys(KINDS).map((k) => [k, {}]));
  const perSource = {};
  const perFormat = {};
  const proArt = Object.fromEntries(Object.keys(KINDS).map((k) => [k, []]));
  for (const it of items) {
    perKind[it.kind]++;
    perUnter[it.kind][it.unter] = (perUnter[it.kind][it.unter] ?? 0) + 1;
    perSource[it.source.id] = (perSource[it.source.id] ?? 0) + 1;
    for (const f of formate(it)) perFormat[f] = (perFormat[f] ?? 0) + 1;
    proArt[it.kind].push(it);
  }
  const sources = SOURCES.map((s) => ({ id: s.id, name: s.name, url: s.url, kinds: s.kinds, terms: s.terms, hinweis: s.hinweis, count: perSource[s.id] ?? 0 }));

  const shards = new Map();
  for (const it of items) {
    const k = shardVon(it.id);
    if (!shards.has(k)) shards.set(k, {});
    shards.get(k)[it.id] = it;
  }

  await rm('public/data', { recursive: true, force: true });
  await mkdir('public/data/karten', { recursive: true });
  await mkdir('public/data/index', { recursive: true });
  for (const [art, liste] of Object.entries(proArt)) {
    if (liste.length) await writeFile(`public/data/index/${art}.json`, JSON.stringify({ felder: FELDER, zeilen: liste.map((it) => zeile(it, it.vorschau)) }));
  }
  await writeFile('public/data/start.json', JSON.stringify({ felder: FELDER, zeilen: startauswahl(items).sort(mix).map((it) => zeile(it, it.vorschau)) }));
  for (const [k, inhalt] of shards) await writeFile(`public/data/karten/${k}.json`, JSON.stringify(inhalt));
  await writeFile(
    'public/data/stand.json',
    JSON.stringify({ crawledAt: katalog.crawledAt ?? null, total: items.length, zusammengefuehrt, perKind, perUnter, perFormat, sources }, null, 1),
  );
  const mitBild = items.filter((it) => it.vorschau).length;
  console.log(`Veröffentlicht: ${items.length} Einträge, ${mitBild} mit Vorschaubild, ${zusammengefuehrt} Doppelte zusammengeführt (ausgelassen: ${skipped.ungueltig} ungültig, ${skipped.kaputt} mit toten Links, ${skipped.gesperrt} gesperrt).`);
}

if (process.argv[1]?.endsWith('publish.mjs')) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
