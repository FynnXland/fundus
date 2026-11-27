// Mini previews: for every entry with a preview picture the crawler fetches the source's thumbnail once,
// scales it to 320 px, stores it as WebP in public/vorschau/ and computes a 64-bit difference hash (dHash)
// of the picture. The site shows these small previews without asking the source; the files themselves
// stay at the source. The dHash feeds the duplicate check (two sources, same picture).
//
//   node crawler/thumbs.mjs            new entries only
//   node crawler/thumbs.mjs --alle     regenerate everything
//   node crawler/thumbs.mjs --max-minuten 35   stop taking new pictures after 35 minutes (CI), the rest comes next run

import { readFile, writeFile, mkdir, readdir, unlink, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { politeFetch, setHostGap, getHostGap } from './lib/http.mjs';
import { ladeKatalog } from './lib/store.mjs';
import { SOURCES } from './sources/index.mjs';

export const BREITE = 320;
const ZIEL = 'public/vorschau';

/** Stable file name for an entry: two hex characters as a folder keep each folder small. */
export function vorschauPfad(id) {
  const h = createHash('sha1').update(id).digest('hex');
  return `${h.slice(0, 2)}/${h.slice(2, 16)}.webp`;
}

/** 64-bit difference hash from a 9×8 greyscale version of the picture, as 16 hex characters. */
export async function dHash(buffer) {
  const { data } = await sharp(buffer).flatten({ background: '#ffffff' }).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (data[y * 9 + x] > data[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}

export function hamming(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

export async function vorschauBauen(buffer) {
  const bild = sharp(buffer, { density: 144 }).flatten({ background: '#f0eee6' });
  const meta = await bild.metadata();
  const webp = await bild.resize({ width: BREITE, height: BREITE, fit: 'inside', withoutEnlargement: false }).webp({ quality: 62, effort: 5 }).toBuffer({ resolveWithObject: true });
  return { webp: webp.data, breite: webp.info.width, hoehe: webp.info.height, quelle: { breite: meta.width, hoehe: meta.height } };
}

/** Where the picture for an entry comes from: the source's thumbnail, or for fonts the TTF file to render. */
export function bildquelle(it) {
  if (it.preview?.thumb) return it.preview.thumb;
  if (it.preview?.type === 'font' && /\.woff2$/.test(it.preview.url ?? '')) return it.preview.url.replace(/\.woff2$/, '.ttf');
  if (it.preview?.type === 'font' && /\.(ttf|otf)$/i.test(it.preview.url ?? '')) return it.preview.url;
  return null;
}

/**
 * Font sample: "Aa" set in the font itself. Pango falls back to a default face without telling when the
 * family name does not match the file, so the result is compared with a rendering in a made-up family:
 * identical pixels mean the font was not used, and the entry gets no sample rather than a wrong one.
 */
let ersatzbild;
async function aa(font, fontfile, text = 'Aa') {
  return sharp({ text: { text: `<span foreground="#1f1e1d">${text}</span>`, font, fontfile, rgba: true, dpi: 1100 } }).png().toBuffer();
}
// Pango registers font files process-wide; two renderings at the same time mix up their files and
// produce empty boxes. Font samples therefore run one after another.
let schlange = Promise.resolve();
export function schriftmuster(familie, ttfPfad) {
  const lauf = schlange.then(() => schriftmusterJetzt(familie, ttfPfad));
  schlange = lauf.catch(() => {});
  return lauf;
}
async function schriftmusterJetzt(familie, ttfPfad) {
  ersatzbild ??= await aa('Fundus Ersatzschrift Gibtsnicht');
  const text = await aa(familie, ttfPfad);
  if (text.equals(ersatzbild)) throw new Error('Schrift nicht erkannt');
  // Some files load but render as empty boxes; then every pair of letters looks the same.
  if (text.equals(await aa(familie, ttfPfad, 'Qg'))) throw new Error('Schrift ohne darstellbare Buchstaben');
  const probe = await sharp(text).resize({ width: 236, height: 200, fit: 'inside' }).toBuffer();
  const webp = await sharp({ create: { width: BREITE, height: BREITE, channels: 3, background: '#f0eee6' } }).composite([{ input: probe, gravity: 'centre' }]).webp({ quality: 70, effort: 5 }).toBuffer();
  return { webp, breite: BREITE, hoehe: BREITE };
}

async function existiert(p) {
  try { await access(p); return true; } catch { return false; }
}

/**
 * Works through the items with `size` workers, several hosts at the same time. Each worker takes the next item
 * of the host whose next free slot comes first, so every host keeps its gap while the others keep going.
 * In catalogue order only one host was ever busy and the whole run moved at that one host's pace.
 */
export async function poolNachHost(items, size, hostVon, abstand, fn) {
  const schlangen = new Map();
  for (const it of items) {
    const h = hostVon(it);
    if (!schlangen.has(h)) schlangen.set(h, { liste: [], i: 0, frei: 0 });
    schlangen.get(h).liste.push(it);
  }
  const naechstes = () => {
    let wahl = null;
    for (const [h, s] of schlangen) {
      if (s.i >= s.liste.length) { schlangen.delete(h); continue; }
      if (!wahl || s.frei < wahl.s.frei) wahl = { h, s };
    }
    if (!wahl) return null;
    wahl.s.frei = Math.max(Date.now(), wahl.s.frei) + abstand(wahl.h);
    return wahl.s.liste[wahl.s.i++];
  };
  await Promise.all(Array.from({ length: size }, async () => {
    for (let it = naechstes(); it; it = naechstes()) await fn(it);
  }));
}

async function main() {
  const alle = process.argv.includes('--alle');
  const { items } = await ladeKatalog(SOURCES.map((s) => s.id));
  let register = {};
  let gesperrtVorab = {};
  try { gesperrtVorab = JSON.parse(await readFile('data/gesperrt.json', 'utf8')); } catch {}
  try { register = JSON.parse(await readFile('data/vorschauen.json', 'utf8')); } catch {}

  for (const host of ['thumb.wikimedia.org', 'upload.wikimedia.org']) setHostGap(host, 700);
  for (const host of ['cdn.polyhaven.org', 'acg-media.struffelproductions.com', 'api.openverse.org', 'api.iconify.design', 'archive.org', 'ids.si.edu']) setHostGap(host, 250);
  setHostGap('cdn.jsdelivr.net', 120);
  // museum image servers behind a CDN (Wellcome about 55,000, Cleveland several thousand pictures);
  // 27,000 Wellcome pictures at 250 ms brought not one 429 or 5xx, so 125 ms
  for (const host of ['iiif.wellcomecollection.org', 'openaccess-cdn.clevelandart.org']) setHostGap(host, 125);
  // opengameart.org/robots.txt asks for Crawl-delay: 10
  setHostGap('opengameart.org', 10000);
  // icons (about 14,600 files) and the Khronos/Godot pictures: GitHub names no limit for raw, politeFetch backs off on 429
  setHostGap('raw.githubusercontent.com', 400);
  setHostGap('fuel.gazebosim.org', 500);

  // The register can be committed while the image files are not (CI), so a missing file counts as new.
  // --quelle <id> and --max <n> limit a run (handy for a first look or for splitting a big backlog)
  const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
  const nurQuelle = arg('--quelle');
  const max = Number(arg('--max')) || Infinity;
  const ende = Number(arg('--max-minuten')) ? Date.now() + Number(arg('--max-minuten')) * 60000 : Infinity;
  // On a CI runner public/vorschau is empty: scripts/vorschau-r2.mjs liste writes what the bucket already holds.
  let imBucket = new Set();
  try { imBucket = new Set(JSON.parse(await readFile('.cache/r2-vorschau.json', 'utf8'))); } catch {}
  const offen = items.filter((it) => {
    const von = bildquelle(it);
    if (!von || gesperrtVorab[it.id] || (nurQuelle && it.source.id !== nurQuelle)) return false;
    const r = register[it.id];
    if (alle || !r || r.von !== von) return true;
    // final failures (file gone, picture unreadable) are not repeated; throttling and timeouts are
    if (!r.pfad) return !r.endgueltig;
    // a missing file is regenerated (the register can outlive the files), unless it is in the R2 bucket
    return !existsSync(`${ZIEL}/${r.pfad}`) && !imBucket.has(r.pfad);
  });
  offen.splice(max);
  console.log(`Vorschaubilder: ${offen.length} neu von ${items.length} Einträgen`);
  let ok = 0, fehler = 0, seitSichern = 0, vertagt = 0;
  // the register is saved every few hundred pictures, so a long run that is interrupted loses little
  const sichern = () => writeFile('data/vorschauen.json', JSON.stringify(register));
  await poolNachHost(offen, 16, (it) => new URL(bildquelle(it)).host, getHostGap, async (it) => {
    if (Date.now() > ende) { vertagt++; return; }
    const von = bildquelle(it);
    try {
      const istSchrift = it.preview.type === 'font' && !it.preview.thumb;
      // the */* fallback matters: Openverse's thumb endpoint answers a pure image list with 406 Not Acceptable
      const res = await politeFetch(von, { timeout: 30000, retries: 2, headers: istSchrift ? {} : { Accept: 'image/webp,image/*,*/*;q=0.8' } });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { endgueltig: res.status === 404 || res.status === 410 });
      const buf = Buffer.from(await res.arrayBuffer());
      let v;
      if (istSchrift) {
        const tmp = `.cache/schrift-${vorschauPfad(it.id).slice(3, 17)}.ttf`;
        await mkdir('.cache', { recursive: true });
        await writeFile(tmp, buf);
        try { v = await schriftmuster(it.title, tmp); } finally { await unlink(tmp).catch(() => {}); }
      } else {
        v = await vorschauBauen(buf);
      }
      const pfad = vorschauPfad(it.id);
      await mkdir(`${ZIEL}/${pfad.slice(0, 2)}`, { recursive: true });
      await writeFile(`${ZIEL}/${pfad}`, v.webp);
      register[it.id] = { pfad, von, b: v.breite, h: v.hoehe, dhash: istSchrift ? undefined : await dHash(buf), kb: Math.round(v.webp.length / 102.4) / 10 };
      if (++ok % 500 === 0) console.log(`  ${ok} fertig`);
      if (++seitSichern >= 400) { seitSichern = 0; await sichern(); }
    } catch (err) {
      fehler++;
      // sharp throws on data that is no picture (an HTML challenge page, a broken file): that is final too
      const endgueltig = err.endgueltig ?? /unsupported image|corrupt|Input buffer|Schrift/i.test(String(err.message));
      register[it.id] = { fehler: String(err.message ?? err).slice(0, 120), von, endgueltig: endgueltig || undefined };
    }
  });

  // Previews of entries that left the catalogue or were reported (data/gesperrt.json) are deleted.
  let gesperrt = {};
  try { gesperrt = JSON.parse(await readFile('data/gesperrt.json', 'utf8')); } catch {}
  const ids = new Set(items.map((it) => it.id).filter((id) => !gesperrt[id]));
  const behalten = new Set();
  for (const [id, r] of Object.entries(register)) {
    if (!ids.has(id)) delete register[id];
    else if (r.pfad) behalten.add(r.pfad);
  }
  let geloescht = 0;
  try {
    for (const ordner of await readdir(ZIEL)) {
      for (const datei of await readdir(`${ZIEL}/${ordner}`)) {
        if (!behalten.has(`${ordner}/${datei}`) && (await existiert(`${ZIEL}/${ordner}/${datei}`))) { await unlink(`${ZIEL}/${ordner}/${datei}`); geloescht++; }
      }
    }
  } catch {}

  await writeFile('data/vorschauen.json', JSON.stringify(register));
  const kb = Object.values(register).reduce((s, r) => s + (r.kb ?? 0), 0);
  console.log(`Fertig: ${ok} erzeugt, ${fehler} fehlgeschlagen, ${vertagt} auf den nächsten Lauf vertagt, ${geloescht} verwaiste gelöscht. Gesamt ${Object.values(register).filter((r) => r.pfad).length} Vorschaubilder, ${(kb / 1024).toFixed(1)} MB.`);
}

if (process.argv[1]?.endsWith('thumbs.mjs')) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
