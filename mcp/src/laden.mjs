// Local download (stdio server only): files come straight from the original source to this computer, Fundus
// is not in between. Next to them a .lizenz.txt with license and attribution, also for CC0 (where it came from).
// Polite to the sources: honest User-Agent, at most two requests per host at once with a short gap, no retry
// on 403 or 429 (a block is respected, see CLAUDE.md), never a Referer.
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { FundusFehler, VERSION, groesse, namensnennung, dateienVon, sha1 } from './kern.mjs';

export const USER_AGENT = `fundus-mcp/${VERSION} (KI-Anbindung des Fundus-Katalogs; Download auf Wunsch einer Person)`;
const PRO_HOST = 2;
const ABSTAND_MS = { 'opengameart.org': 1000 }; // others: DEFAULT_ABSTAND
const DEFAULT_ABSTAND = 150;
const MAX_DATEIEN = 400;

export function standardZiel() {
  return process.env.FUNDUS_ZIEL || path.join(homedir(), 'Downloads', 'Fundus');
}

/** One path segment safe for Windows, macOS and Linux. */
function sicher(segment) {
  const s = segment.normalize('NFC').replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim();
  if (!s || s === '.' || s === '..') throw new FundusFehler(`unsafe path segment "${segment}" in the package`);
  return /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s) ? `_${s}` : s;
}

/** Relative path from crawled data: no absolute paths, no "..", only safe segments. */
export function sichererPfad(rel) {
  const norm = String(rel).replace(/\\/g, '/');
  const teile = norm.split('/').filter((x) => x !== '' && x !== '.');
  if (!teile.length || norm.startsWith('/') || teile.includes('..') || /^[a-z]:/i.test(teile[0])) throw new FundusFehler(`unsafe path "${rel}" in the package`);
  return path.join(...teile.map(sicher));
}

export function dateinameAusUrl(url, ersatz) {
  try {
    const letzter = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
    if (letzter && /\.[a-z0-9]{1,6}$/i.test(letzter)) return sicher(letzter);
  } catch {}
  return sicher(ersatz);
}

export function lizenztext(it, d, wann = new Date()) {
  const l = it.license;
  return [
    it.title,
    '',
    `Urheber: ${it.creator?.name ?? 'unbekannt'}${it.creator?.url ? ` (${it.creator.url})` : ''}`,
    `Lizenz: ${l.name}${l.url ? ` (${l.url})` : ''}`,
    `Namensnennung: ${namensnennung(it)}`,
    `Quelle: ${it.source.url} (${it.source.name})`,
    `Download: ${d.label}`,
    `Fundus-ID: ${it.id}`,
    `Heruntergeladen am ${wann.toISOString().slice(0, 10)} über Fundus (Katalog, die Datei kommt direkt von der Quelle).`,
    l.attribution ? 'Bei Weitergabe oder Veröffentlichung die Namensnennung oben mitgeben.' : 'Keine Namensnennung vorgeschrieben; die Angaben oben dokumentieren die Herkunft.',
    '',
  ].join('\n');
}

/** Runs jobs per host: at most PRO_HOST at once, starts spaced by the host gap. The first error stops new starts. */
async function proHost(aufgaben) {
  const gruppen = new Map();
  for (const a of aufgaben) {
    const h = new URL(a.url).hostname;
    if (!gruppen.has(h)) gruppen.set(h, []);
    gruppen.get(h).push(a);
  }
  let fehler = null;
  await Promise.all([...gruppen].map(async ([host, liste]) => {
    const abstand = ABSTAND_MS[host.replace(/^www\./, '')] ?? DEFAULT_ABSTAND;
    let naechster = 0;
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(PRO_HOST, liste.length) }, async () => {
      while (!fehler && i < liste.length) {
        const a = liste[i++];
        const warte = naechster - Date.now();
        naechster = Math.max(Date.now(), naechster) + abstand;
        if (warte > 0) await new Promise((r) => setTimeout(r, warte));
        try { await a.lauf(); } catch (err) { fehler ??= err; }
      }
    }));
  }));
  if (fehler) throw fehler;
}

async function ladeDatei(url, ziel, { fetch: holen, rest }) {
  const res = await holen(url, { headers: { 'user-agent': USER_AGENT }, referrerPolicy: 'no-referrer', redirect: 'follow' });
  if (res.status === 403 || res.status === 429) throw new FundusFehler(`The source refused the download (HTTP ${res.status}) for ${url}. Fundus respects such blocks; open the source page in a browser instead.`);
  if (!res.ok || !res.body) throw new FundusFehler(`Download failed (HTTP ${res.status}) for ${url}`);
  const laenge = Number(res.headers.get('content-length'));
  if (laenge && laenge > rest.bytes) throw new FundusFehler(`Stopped: ${url} is ${groesse(laenge)}, more than the remaining limit`);
  await mkdir(path.dirname(ziel), { recursive: true });
  const tmp = `${ziel}.part`;
  let n = 0;
  const zaehler = new Transform({
    transform(chunk, _enc, cb) {
      n += chunk.length;
      rest.bytes -= chunk.length;
      if (rest.bytes < 0) cb(new FundusFehler('Stopped: the download exceeds max_mb'));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body), zaehler, createWriteStream(tmp));
    await rename(tmp, ziel);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  return n;
}

/** The download tool of the local server. Returns the answer text. */
export function erstelleDownloader({ fetch: holen = globalThis.fetch.bind(globalThis) } = {}) {
  return async function herunterladen({ it, nr, ziel, maxMb, ueberschreiben }) {
    const d = it.downloads[nr - 1];
    if (!d) throw new FundusFehler(`${it.id} has ${it.downloads.length} download option(s); pick 1 to ${it.downloads.length}`);
    const angegeben = d.paket?.size ?? d.size;
    if (angegeben && angegeben > maxMb * 1024 * 1024) throw new FundusFehler(`${d.label} is ${groesse(angegeben)}, above max_mb ${maxMb}. Ask the person, then call again with a higher max_mb, or choose a smaller option (fundus_details).`);
    if (ziel && !path.isAbsolute(ziel)) throw new FundusFehler(`target_dir must be an absolute path (got "${ziel}")`);
    const basis = path.resolve(ziel || standardZiel());
    const dateien = dateienVon(d);
    if (dateien.length > MAX_DATEIEN) throw new FundusFehler(`package has ${dateien.length} files, more than ${MAX_DATEIEN}`);
    // where it goes: a package into a folder of its own, a single file directly into the target. When that name
    // already belongs to another entry (its license file names another id), the name gets a short hash of this id.
    const kurz = (await sha1(it.id)).slice(0, 6);
    const fremd = async (lizenzPfad, belegt) => {
      if (!belegt) return false;
      const t = await readFile(lizenzPfad, 'utf8').catch(() => '');
      return !t.includes(`Fundus-ID: ${it.id}\n`);
    };
    let ordner = basis;
    let einzeln = null;
    if (d.paket) {
      ordner = path.join(basis, sicher(d.paket.name || it.id.replace(/[:/]/g, '_')));
      if (await fremd(path.join(ordner, 'LIZENZ.txt'), await stat(ordner).catch(() => null))) ordner = `${ordner}_${kurz}`;
    } else {
      einzeln = dateinameAusUrl(dateien[0].url, `${it.id.replace(/[:/]/g, '_')}.${d.format || 'bin'}`);
      if (await fremd(path.join(basis, `${einzeln}.lizenz.txt`), await stat(path.join(basis, einzeln)).catch(() => null))) einzeln = einzeln.replace(/(\.[^.]+)?$/, `_${kurz}$1`);
    }
    const plan = dateien.map((f) => {
      const rel = f.pfad ? sichererPfad(f.pfad) : einzeln;
      const voll = path.resolve(ordner, rel);
      if (!voll.startsWith(ordner + path.sep)) throw new FundusFehler(`unsafe path "${f.pfad ?? f.url}"`);
      return { url: f.url, voll };
    });
    const rest = { bytes: maxMb * 1024 * 1024 };
    const fertig = [];
    const vorhanden = [];
    await proHost(plan.map((p) => ({
      url: p.url,
      lauf: async () => {
        if (!ueberschreiben && (await stat(p.voll).catch(() => null))?.isFile()) { vorhanden.push(p.voll); return; }
        const n = await ladeDatei(p.url, p.voll, { fetch: holen, rest });
        fertig.push({ pfad: p.voll, n });
      },
    }))).catch(async (err) => {
      const teil = fertig.length ? ` ${fertig.length} file(s) were saved before: ${fertig.map((f) => f.pfad).join(', ')}` : '';
      throw new FundusFehler(`${err.message}.${teil}`);
    });
    const lizenzDatei = d.paket ? path.join(ordner, 'LIZENZ.txt') : `${plan[0].voll}.lizenz.txt`;
    await mkdir(path.dirname(lizenzDatei), { recursive: true });
    await writeFile(lizenzDatei, lizenztext(it, d), 'utf8');
    const summe = fertig.reduce((s, f) => s + f.n, 0);
    const zeilen = [
      `Saved ${it.title} [${it.id}], option ${nr} (${d.label}) from ${it.source.name}: ${fertig.length} file(s), ${groesse(summe)}${vorhanden.length ? `, ${vorhanden.length} already there (kept)` : ''}.`,
      d.paket ? `Folder: ${ordner}` : `File: ${plan[0].voll}`,
      `License file: ${lizenzDatei}`,
      `License: ${it.license.name}. Attribution: ${namensnennung(it)}`,
    ];
    return zeilen.join('\n');
  };
}

/** Thumbnail at the source for entries without own preview (local server only, on request). */
export function erstelleQuellbild({ fetch: holen = globalThis.fetch.bind(globalThis) } = {}) {
  const ERLAUBT = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  return async function quellbild(url) {
    const res = await holen(url, { headers: { 'user-agent': USER_AGENT, accept: 'image/webp,image/png,image/jpeg,*/*' }, referrerPolicy: 'no-referrer' });
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!ERLAUBT.has(mime)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length <= 1.5 * 1024 * 1024 ? { bytes, mime } : null;
  };
}
