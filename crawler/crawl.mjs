// Crawler: asks every source adapter for entries and merges them into that source's catalogue file
// (data/katalog/<quelle>.json). Entries that a source did not deliver this time stay (a search result
// can shift, large sources are crawled in stages); the link checker removes the ones whose files are gone.
// Duplicates across sources are merged later, when publishing.
//
//   node crawler/crawl.mjs                     all sources
//   node crawler/crawl.mjs --quelle polyhaven  one source (several: --quelle a,b)
//
// Environment: FUNDUS_KONTAKT (contact URL for the User-Agent, Wikimedia asks for it), GITHUB_TOKEN and
// the other optional keys listed in the README.

import { readFile } from 'node:fs/promises';
import { SOURCES } from './sources/index.mjs';
import { dedupe } from './lib/dedupe.mjs';
import { ladeQuelle, schreibeQuelle, migriere } from './lib/store.mjs';

export function merge(previous, fresh) {
  const byId = new Map(previous.map((it) => [it.id, it]));
  for (const it of fresh) {
    const old = byId.get(it.id);
    byId.set(it.id, { ...it, firstSeen: old?.firstSeen ?? it.fetchedAt });
  }
  return dedupe([...byId.values()]);
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes('--quelle') ? args[args.indexOf('--quelle') + 1].split(',') : null;
  const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
  await migriere();

  const log = (msg) => console.log(msg);
  const chosen = SOURCES.filter((s) => !only || only.includes(s.id));
  if (!chosen.length) throw new Error(`Unbekannte Quelle: ${only}. Bekannt: ${SOURCES.map((s) => s.id).join(', ')}`);

  // Sources live on different hosts, so they run in parallel; each adapter paces its own host and
  // each source has its own file.
  let gesamt = 0;
  await Promise.allSettled(
    chosen.map(async (s) => {
      const t = Date.now();
      try {
        const fresh = await s.crawl(config[s.id] ?? {}, log);
        const vorher = (await ladeQuelle(s.id)).items;
        const items = merge(vorher, fresh).sort((a, b) => a.id.localeCompare(b.id));
        // an adapter that returns nothing (missing key, source down) must not touch the crawl date
        if (fresh.length) await schreibeQuelle(s.id, items);
        gesamt += items.length;
        log(`${s.name}: ${fresh.length} geholt, ${items.length} im Bestand (vorher ${vorher.length}), ${Math.round((Date.now() - t) / 1000)} s`);
      } catch (err) {
        log(`${s.name}: fehlgeschlagen (${err?.message ?? err}), Bestand bleibt`);
      }
    }),
  );
  log(`Fertig: ${chosen.length} Quellen, ${gesamt} Einträge in den bearbeiteten Quellen.`);
}

if (process.argv[1]?.endsWith('crawl.mjs')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
