// Adds rating and popularity to entries that are already in the catalogue, without crawling them again.
// Two sources crawl in stages and never revisit an entry (Internet Archive over weeks, Gazebo Fuel in a 14-day walk),
// so entries stored before the fields existed would stay without them. Everything else (GitHub, Poly Haven,
// ambientCG, Blender) is read in full on every crawl and gets the fields by a normal `crawl.mjs --quelle ...`.
//
//   node crawler/bewertungen-nachtragen.mjs --quelle internetarchive     ~15 requests per 750 entries (50 per request)
//   node crawler/bewertungen-nachtragen.mjs --quelle fuel                 offline, from meta.abrufe
//   --von a.json --nach b.json   read and write other files (default: the source catalogue, in place)
//   --probe 100                  only the first 100 entries, nothing is written
//
// Internet Archive: advancedsearch with 50 identifiers per request (fields avg_rating, num_reviews, downloads),
// one request per second. Entries the search no longer finds keep what they had.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { getJson, setHostGap } from './lib/http.mjs';
import { beliebtheit } from './lib/bewertung.mjs';
import { bewertungVon } from './sources/internetarchive.mjs';
import { ladeQuelle, schreibeQuelle } from './lib/store.mjs';

const SEARCH = 'https://archive.org/advancedsearch.php';
const PACK = 50;

export function nachIds(ids) {
  const p = new URLSearchParams({ q: `identifier:(${ids.map((i) => `"${i}"`).join(' OR ')})` });
  for (const f of ['identifier', 'avg_rating', 'num_reviews', 'downloads']) p.append('fl[]', f);
  p.set('rows', String(ids.length));
  p.set('output', 'json');
  return `${SEARCH}?${p}`;
}

const ohne = (it) => {
  const { rating: _r, popularity: _p, ...rest } = it;
  return rest;
};

/** Puts rating and popularity from the search hits into Internet Archive entries (a fresh answer replaces the old values). */
export function anwenden(items, treffer) {
  const byId = new Map(treffer.map((d) => [d.identifier, d]));
  let bewertet = 0;
  let beliebt = 0;
  const out = items.map((it) => {
    const id = it.id.replace(/^internetarchive:/, '');
    const d = byId.get(id);
    if (!d) return it;
    const { rating, popularity } = bewertungVon(id, d);
    if (rating) bewertet++;
    if (popularity) beliebt++;
    return { ...ohne(it), ...(rating ? { rating } : {}), ...(popularity ? { popularity } : {}) };
  });
  return { items: out, bewertet, beliebt, gefunden: byId.size };
}

/** Gazebo Fuel: the download count the adapter keeps in meta.abrufe becomes the popularity. */
export function fuelAnwenden(items) {
  let beliebt = 0;
  const out = items.map((it) => {
    const popularity = beliebtheit({ value: it.meta?.abrufe, label: 'Downloads', name: 'Gazebo Fuel', url: it.source.url });
    if (!popularity) return it;
    beliebt++;
    return { ...ohne(it), popularity };
  });
  return { items: out, bewertet: 0, beliebt, gefunden: out.length };
}

async function main() {
  const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
  const quelle = arg('--quelle');
  if (!['internetarchive', 'fuel'].includes(quelle)) throw new Error('--quelle internetarchive oder --quelle fuel');
  // without --von/--nach the source's own catalogue (one file or split into parts, lib/store.mjs)
  const von = arg('--von');
  const nach = arg('--nach') ?? von;
  const probe = Number(arg('--probe')) || 0;
  const bestand = von ? JSON.parse(await readFile(von, 'utf8')) : await ladeQuelle(quelle);
  const items = probe ? bestand.items.slice(0, probe) : bestand.items;
  let r;
  if (quelle === 'fuel') r = fuelAnwenden(items);
  else {
    setHostGap('archive.org', 1000);
    const treffer = [];
    for (let i = 0; i < items.length; i += PACK) {
      const ids = items.slice(i, i + PACK).map((it) => it.id.replace(/^internetarchive:/, '')).filter((x) => /^[A-Za-z0-9._-]+$/.test(x));
      treffer.push(...((await getJson(nachIds(ids))).response?.docs ?? []));
    }
    r = anwenden(items, treffer);
  }
  console.log(`${items.length} Einträge, ${r.gefunden} Treffer, ${r.bewertet} mit Bewertung, ${r.beliebt} mit Beliebtheit`);
  if (probe) return;
  if (!nach) return schreibeQuelle(quelle, r.items, bestand.crawledAt);
  await writeFile(`${nach}.neu`, `{"crawledAt":${JSON.stringify(bestand.crawledAt)},"items":[\n${r.items.map((it) => JSON.stringify(it)).join(',\n')}\n]}\n`);
  await rename(`${nach}.neu`, nach);
}

if (process.argv[1]?.endsWith('bewertungen-nachtragen.mjs')) main().catch((e) => { console.error(e); process.exit(1); });
