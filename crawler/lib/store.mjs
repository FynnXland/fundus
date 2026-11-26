// Catalogue storage: one file per source under data/katalog/<quelle>.json, one entry per line.
// Per-source files let several sources be crawled at the same time without overwriting each other and keep
// diffs readable. A large source (Wellcome, Internet Archive, GitHub) is split into parts of TEIL entries under
// data/katalog/<quelle>/teil-NN.json: GitHub refuses files above 100 MB and warns above 50 MB.
// When both forms exist, the single file wins: it can only be newer (a writer of parts deletes it).

import { readFile, writeFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';

const ORDNER = 'data/katalog';
export const TEIL = 15000;

const leer = () => ({ crawledAt: null, items: [] });
const inhalt = (crawledAt, items) => `{"crawledAt":${JSON.stringify(crawledAt)},"items":[\n${items.map((it) => JSON.stringify(it)).join(',\n')}\n]}\n`;

// write next to the target and rename, so a reader never sees half a file
async function schreibeDatei(ziel, text) {
  await writeFile(`${ziel}.neu`, text);
  await rename(`${ziel}.neu`, ziel);
}

export async function ladeQuelle(id) {
  try {
    return JSON.parse(await readFile(`${ORDNER}/${id}.json`, 'utf8'));
  } catch {}
  try {
    const teile = (await readdir(`${ORDNER}/${id}`)).filter((f) => /^teil-\d+\.json$/.test(f)).sort();
    const out = leer();
    for (const t of teile) {
      const q = JSON.parse(await readFile(`${ORDNER}/${id}/${t}`, 'utf8'));
      out.crawledAt ??= q.crawledAt;
      for (const it of q.items) out.items.push(it);
    }
    return out;
  } catch {
    return leer();
  }
}

export async function schreibeQuelle(id, items, crawledAt = new Date().toISOString()) {
  await mkdir(ORDNER, { recursive: true });
  if (items.length <= TEIL) {
    await schreibeDatei(`${ORDNER}/${id}.json`, inhalt(crawledAt, items));
    await rm(`${ORDNER}/${id}`, { recursive: true, force: true });
    return;
  }
  const ordner = `${ORDNER}/${id}`;
  await mkdir(ordner, { recursive: true });
  const namen = [];
  for (let i = 0; i * TEIL < items.length; i++) {
    const name = `teil-${String(i).padStart(2, '0')}.json`;
    namen.push(name);
    await schreibeDatei(`${ordner}/${name}`, inhalt(crawledAt, items.slice(i * TEIL, (i + 1) * TEIL)));
  }
  for (const f of await readdir(ordner)) if (!namen.includes(f)) await rm(`${ordner}/${f}`, { force: true });
  await rm(`${ORDNER}/${id}.json`, { force: true });
}

/** Ids of all sources on disk, single files and split folders. */
export async function quellenAufPlatte() {
  const ids = new Set();
  try {
    for (const f of await readdir(ORDNER)) {
      if (f.endsWith('.json')) ids.add(f.slice(0, -5));
      else if (!f.includes('.') && (await stat(`${ORDNER}/${f}`)).isDirectory()) ids.add(f);
    }
  } catch {}
  return [...ids].sort();
}

/**
 * All entries of the given sources, in that order (the order decides who wins when the same work comes
 * from two sources). Without ids: every file in the folder.
 */
export async function ladeKatalog(ids) {
  await migriere();
  const quellen = ids ?? (await quellenAufPlatte());
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
