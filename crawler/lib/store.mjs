// Catalogue storage: one file per source under data/katalog/<quelle>.json, one entry per line.
// Per-source files let several sources be crawled at the same time without overwriting each other,
// keep diffs readable and stay well below the size where a single JSON file becomes unwieldy.

import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';

const ORDNER = 'data/katalog';

export async function ladeQuelle(id) {
  try {
    return JSON.parse(await readFile(`${ORDNER}/${id}.json`, 'utf8'));
  } catch {
    return { crawledAt: null, items: [] };
  }
}

export async function schreibeQuelle(id, items, crawledAt = new Date().toISOString()) {
  await mkdir(ORDNER, { recursive: true });
  const zeilen = items.map((it) => JSON.stringify(it)).join(',\n');
  const ziel = `${ORDNER}/${id}.json`;
  // write next to the target and rename, so a reader never sees half a file
  await writeFile(`${ziel}.neu`, `{"crawledAt":${JSON.stringify(crawledAt)},"items":[\n${zeilen}\n]}\n`);
  await rename(`${ziel}.neu`, ziel);
}

/**
 * All entries of the given sources, in that order (the order decides who wins when the same work comes
 * from two sources). Without ids: every file in the folder.
 */
export async function ladeKatalog(ids) {
  await migriere();
  let quellen = ids;
  if (!quellen) {
    try {
      quellen = (await readdir(ORDNER)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    } catch {
      quellen = [];
    }
  }
  const items = [];
  let crawledAt = null;
  for (const id of quellen) {
    const q = await ladeQuelle(id);
    for (const it of q.items) items.push(it);
    if (q.crawledAt && (!crawledAt || q.crawledAt > crawledAt)) crawledAt = q.crawledAt;
  }
  return { crawledAt, items };
}

/** One-time split of the former single file data/katalog.json into per-source files. */
let migriert = false;
export async function migriere() {
  if (migriert) return;
  migriert = true;
  let alt;
  try {
    alt = JSON.parse(await readFile('data/katalog.json', 'utf8'));
  } catch {
    return;
  }
  const proQuelle = new Map();
  for (const it of alt.items ?? []) {
    if (!proQuelle.has(it.source.id)) proQuelle.set(it.source.id, []);
    proQuelle.get(it.source.id).push(it);
  }
  for (const [id, items] of proQuelle) {
    const vorhanden = await ladeQuelle(id);
    if (!vorhanden.items.length) await schreibeQuelle(id, items, alt.crawledAt);
  }
  await rename('data/katalog.json', 'data/katalog.alt.json');
}
