// Read side of the Fundus MCP server: the public static files of the website, fetched over HTTP. Runs in Node
// and in a Cloudflare Worker (only fetch and crypto.subtle). File layout: crawler/lib/ausgabe.mjs, docs/stand/fundus-index.md.
//
//   stand.json                 counts, sources, index.arten (parts per kind), index.kacheln (search tile keys)
//   index/<art>/<nn>.json      parts of 500 rows, ordered by subfolder; a row is an array in the order of index.felder
//   suche/k_<key>.json         search tiles: term -> ref lists (suchindex.mjs)
//   karten/<xx>.json           full entries, xx = first two hex digits of sha1(id)
//   vorschau/<xx>/<14 hex>.webp own 320 px previews, path from sha1(id) like crawler/thumbs.mjs vorschauPfad()
//
// Nothing loads a whole kind: a search walks its ranked hits, a listing walks the parts in order, and both stop
// when the page is full or after maxAbrufe files. The cursor is the position to continue from.
import { woerter, kachelnFuerAnfrage, kachelDatei, kartenFuer, undVerknuepft, teilTreffer, rangfolge, normalisiere } from './suchindex.mjs';

/** Below this many entries matching all words (after kind and subfolder), entries matching most words follow. */
export const RUECKFALL_UNTER = 3;

export const VERSION = '0.1.0'; // keep equal to mcp/package.json

export const LIZENZGRUPPEN = {
  frei: 'no attribution required (CC0, public domain, zlib, Unlicense)',
  nennung: 'attribution required (CC BY, MIT, Apache, BSD)',
  gleich: 'attribution + share-alike / copyleft (CC BY-SA, GPL, OFL, MPL)',
};

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function sha1(text) {
  return hex(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)));
}
/** Path of the own preview, the same rule as vorschauPfad() in crawler/thumbs.mjs. */
export async function vorschauPfad(id) {
  const h = await sha1(id);
  return `${h.slice(0, 2)}/${h.slice(2, 16)}.webp`;
}

/** RIFF....WEBP */
export const istWebp = (b) => b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;

/** Small LRU on a Map: the oldest key goes when the cap is reached. */
class Merker {
  constructor(max) { this.max = max; this.m = new Map(); }
  get(k) { const v = this.m.get(k); if (v !== undefined) { this.m.delete(k); this.m.set(k, v); } return v; }
  set(k, v) { this.m.delete(k); this.m.set(k, v); if (this.m.size > this.max) this.m.delete(this.m.keys().next().value); return v; }
  clear() { this.m.clear(); }
}

export class FundusFehler extends Error {}

const ohneTracking = (url) => String(url ?? '').replace(/([?&])utm_[a-z]+=[^&#]*/gi, '$1').replace(/[?&]+(?=#|$)/, '').replace(/\?&+/, '?');
export { ohneTracking };

/**
 * daten: base URL of public/data (e.g. https://example.org/data), vorschau: base URL of the previews.
 * fetch: injectable (tests, Pages Functions with env.ASSETS). maxAbrufe: index files one call may load.
 */
export function erstelleKern({ daten, vorschau, fetch: holen = globalThis.fetch.bind(globalThis), ttl = 10 * 60_000, maxAbrufe = 12, kopfzeilen = {} } = {}) {
  if (!daten) throw new Error('erstelleKern: Basis-URL der Daten fehlt');
  const basis = daten.replace(/\/+$/, '');
  const vbasis = (vorschau ?? basis.replace(/\/data$/, '/vorschau')).replace(/\/+$/, '');
  let standLauf = null;
  let standZeit = 0;
  let k = null; // derived from stand.json: blocks, kinds, tiles
  const teile = new Merker(120); // part file -> rows (about 160 KB raw each)
  const kacheln = new Merker(200);
  const karten = new Merker(24); // shard -> { id: entry } (about 290 KB raw each)
  const zeilen = new Merker(5000); // id -> row, filled by everything that loads rows

  /** fehlend: value to return when the file does not exist (404, or index.html from a single-page host). */
  async function holeJson(pfad, { fehlend } = {}) {
    let res;
    try {
      res = await holen(`${basis}/${pfad}`, { headers: { accept: 'application/json', ...kopfzeilen } });
    } catch (err) {
      throw new FundusFehler(`Fundus data not reachable (${basis}/${pfad}): ${err.message}`);
    }
    if (res.status === 404 && fehlend !== undefined) return fehlend;
    if (!res.ok) throw new FundusFehler(`Fundus data not reachable (${pfad}: HTTP ${res.status})`);
    const body = await res.text();
    try {
      return JSON.parse(body);
    } catch {
      if (fehlend !== undefined) return fehlend;
      throw new FundusFehler(`Fundus data missing or not JSON (${basis}/${pfad})`);
    }
  }

  async function stand() {
    if (k && Date.now() - standZeit < ttl) return k;
    standLauf ??= holeJson('stand.json')
      .then((s) => {
        if (s.index?.version !== 2) throw new FundusFehler(`Unknown data format (stand.index.version ${s.index?.version ?? 'missing'}, expected 2)`);
        if (k && k.stand.crawledAt !== s.crawledAt) { teile.clear(); kacheln.clear(); karten.clear(); zeilen.clear(); }
        k = baue(s);
        standZeit = Date.now();
        return k;
      })
      .finally(() => { standLauf = null; });
    return standLauf;
  }

  function baue(s) {
    const ix = s.index;
    const arten = new Map();
    const bloecke = [];
    let ref = 0;
    for (const e of ix.arten) {
      const a = { art: e.art, anzahl: e.anzahl, unter: e.unter, start: ref, ende: ref + e.anzahl, teile: [] };
      let von = ref;
      e.teile.forEach(([n, u0, u1], nr) => {
        const t = { art: e.art, nr, anzahl: n, von: u0, bis: u1, start: von, datei: `index/${e.art}/${String(nr).padStart(2, '0')}.json` };
        von += n;
        a.teile.push(t);
        bloecke.push(t);
      });
      ref += e.anzahl;
      arten.set(e.art, a);
    }
    return {
      stand: s,
      felder: ix.felder,
      arten,
      bloecke,
      gesamt: ref,
      schluessel: ix.kacheln,
      gruppen: ix.lizenzgruppen,
      quellen: new Map(s.sources.map((q) => [q.id, q])),
    };
  }

  function blockVon(ref) {
    let lo = 0;
    let hi = k.bloecke.length - 1;
    while (lo < hi) {
      const mitte = (lo + hi + 1) >> 1;
      if (k.bloecke[mitte].start <= ref) lo = mitte; else hi = mitte - 1;
    }
    return k.bloecke[lo];
  }

  function zeileBauen(z, art) {
    const o = {};
    for (let i = 0; i < k.felder.length; i++) o[k.felder[i]] = z[i];
    o.art = art;
    o.quellname = k.quellen.get(o.quelle)?.name ?? o.quelle;
    o.gruppe = k.gruppen[o.lizenz] ?? '';
    return o;
  }

  async function ladeTeil(t, zaehler) {
    const da = teile.get(t.datei);
    if (da) return da;
    zaehler.n++;
    const d = await holeJson(t.datei);
    const rows = d.zeilen.map((z) => zeileBauen(z, t.art));
    for (const r of rows) zeilen.set(r.id, r);
    return teile.set(t.datei, rows);
  }

  async function ladeKachel(s) {
    const da = kacheln.get(s);
    if (da) return da;
    return kacheln.set(s, await holeJson(`suche/${kachelDatei(s)}`));
  }

  /* ---------------- Checking parameters ---------------- */

  function art(name) {
    if (!name) return null;
    const a = k.arten.get(name);
    if (!a) throw new FundusFehler(`Unknown kind "${name}". Kinds: ${[...k.arten.keys()].join(', ')}`);
    return a;
  }

  function unterIndex(a, unter) {
    if (!unter) return -1;
    if (!a) throw new FundusFehler('subfolder needs a kind');
    const i = a.unter.findIndex((u) => normalisiere(u) === normalisiere(unter));
    if (i < 0) throw new FundusFehler(`Unknown subfolder "${unter}" for ${a.art}. Subfolders: ${a.unter.join(', ')}`);
    return i;
  }

  function quelleId(q) {
    if (!q) return null;
    const n = normalisiere(q);
    for (const s of k.quellen.values()) if (normalisiere(s.id) === n || normalisiere(s.name) === n) return s.id;
    throw new FundusFehler(`Unknown source "${q}". See fundus_catalog for source ids.`);
  }

  /* ---------------- Search and listing ---------------- */

  /**
   * One page of entries. Without q the rows come in index order (by subfolder and tags), with q by relevance.
   * Returns { treffer, weiter (cursor or null), gesamt (exact count or null), teilweise (stopped at the fetch cap),
   * voll (entries matching all words, before row filters), rueckfall (true when entries matching only some words
   * follow them; such rows carry fehlt = the missing words) }.
   */
  async function suchen({ q, art: artName, unter, tags, lizenz, lizenzgruppe, format, quelle, mitVorschau, limit = 10, cursor } = {}) {
    await stand();
    const a = art(artName);
    const ui = unterIndex(a, unter);
    const unterName = ui >= 0 ? a.unter[ui] : null;
    const qid = quelleId(quelle);
    if (lizenzgruppe && !LIZENZGRUPPEN[lizenzgruppe]) throw new FundusFehler(`license_group must be one of ${Object.keys(LIZENZGRUPPEN).join(', ')}`);
    const lizenzN = lizenz ? normalisiere(lizenz) : null;
    const formatN = format ? normalisiere(format).replace(/^\./, '') : null;
    const tagWoerter = (Array.isArray(tags) ? tags : tags ? [tags] : []).map((t) => woerter(t)).filter((w) => w.length);
    limit = Math.max(1, Math.min(50, Math.floor(limit)));
    let pos = 0;
    if (cursor != null && cursor !== '') {
      pos = Number.parseInt(String(cursor), 36);
      if (!Number.isFinite(pos) || pos < 0) throw new FundusFehler('invalid cursor');
    }

    const passt = (r) =>
      (!unterName || r.unter === unterName) &&
      (!lizenzN || normalisiere(r.lizenz) === lizenzN) &&
      (!lizenzgruppe || r.gruppe === lizenzgruppe) &&
      (!formatN || r.formate.split(' ').includes(formatN)) &&
      (!qid || r.quelle === qid) &&
      (!mitVorschau || Boolean(r.vorschau)) &&
      tagWoerter.every((ws) => { const t = woerter(`${r.tags} ${r.unter}`); return ws.every((w) => t.some((x) => x.startsWith(w))); });
    const zeilenfilter = Boolean(lizenzN || lizenzgruppe || formatN || qid || mitVorschau || tagWoerter.length);

    // the sequence of refs to walk
    let refs = null; // ranked hits (search) or null (listing over blocks)
    let bloecke = null;
    let gesamt = null;
    let voll = null;
    let fehlt = null; // ref -> missing words, for the fallback rows
    const deckt = (t) => ui < 0 || (t.von <= ui && ui <= t.bis);
    if (q && woerter(q).length) {
      const geladen = new Map();
      await Promise.all(kachelnFuerAnfrage(q, k.schluessel).map(async (s) => geladen.set(s, await ladeKachel(s))));
      const { ws, karten } = kartenFuer(q, geladen, k.schluessel);
      const imBereich = (r) => (!a || (r >= a.start && r < a.ende)) && (ui < 0 || deckt(blockVon(r)));
      refs = rangfolge(undVerknuepft(karten)).filter(imBereich);
      voll = refs.length;
      // Row filters (licence, format, …) can drop every full hit, which only the walk below sees: with them the
      // partial hits always follow the full ones and show up only once those are used up.
      if (ws.length > 1 && (voll < RUECKFALL_UNTER || zeilenfilter)) {
        const teil = teilTreffer(ws, karten, { filter: imBereich });
        fehlt = new Map(teil.map(([r, maske]) => [r, ws.filter((_, i) => !(maske & (1 << i))).join(' ')]));
        refs = refs.concat(teil.map(([r]) => r));
      }
      if (!zeilenfilter && ui < 0) gesamt = refs.length;
    } else {
      bloecke = (a ? a.teile : k.bloecke).filter(deckt);
      if (!zeilenfilter) gesamt = ui >= 0 ? k.stand.perUnter?.[a.art]?.[unterName] ?? null : a ? a.anzahl : k.gesamt;
    }
    const laenge = refs ? refs.length : bloecke.reduce((s, t) => s + t.anzahl, 0);
    // position -> [block, row index in block]
    const ortVon = (p) => {
      if (refs) { const t = blockVon(refs[p]); return [t, refs[p] - t.start]; }
      let rest = p;
      for (const t of bloecke) { if (rest < t.anzahl) return [t, rest]; rest -= t.anzahl; }
      return null;
    };

    // without row filters and subfolder every position is a match: the position is the match number
    const ab = !zeilenfilter && ui < 0 ? pos + 1 : null;
    const zaehler = { n: 0 };
    const treffer = [];
    let teilweise = false;
    while (pos < laenge && treffer.length < limit) {
      const [t, i] = ortVon(pos);
      if (!teile.get(t.datei)) {
        if (zaehler.n >= maxAbrufe) { teilweise = true; break; }
        // load this part and the next distinct parts the walk will need, a few at a time
        const vorne = [t];
        const platz = () => vorne.length < 4 && vorne.length + zaehler.n < maxAbrufe;
        if (refs) {
          // without row filters only the refs of this page matter
          const bis = pos + (zeilenfilter ? 2000 : limit - treffer.length);
          for (let p = pos + 1; p < laenge && p < bis && platz(); p++) {
            const u = blockVon(refs[p]);
            if (!vorne.includes(u) && !teile.get(u.datei)) vorne.push(u);
          }
        } else if (zeilenfilter) {
          for (let b = bloecke.indexOf(t) + 1; b < bloecke.length && platz(); b++) if (!teile.get(bloecke[b].datei)) vorne.push(bloecke[b]);
        }
        await Promise.all(vorne.map((u) => ladeTeil(u, zaehler)));
      }
      const r = teile.get(t.datei)[i];
      const fehlend = fehlt?.get(refs[pos]);
      pos++;
      if (r && passt(r)) treffer.push(fehlend ? { ...r, fehlt: fehlend } : r);
    }
    const rueckfall = zeilenfilter ? treffer.some((r) => r.fehlt) : Boolean(fehlt?.size);
    return { treffer, weiter: pos < laenge ? pos.toString(36) : null, gesamt, ab, teilweise, abrufe: zaehler.n, voll, rueckfall };
  }

  /* ---------------- Entries ---------------- */

  async function eintrag(id) {
    await stand();
    const s = (await sha1(id)).slice(0, 2);
    let shard = karten.get(s);
    if (!shard) shard = karten.set(s, await holeJson(`karten/${s}.json`, { fehlend: {} }));
    const it = shard[id];
    if (!it) throw new FundusFehler(`No entry with id "${id}" (ids look like "polyhaven:tree_small_02"; take them from fundus_search)`);
    return it;
  }

  /** A row for an id: from rows already seen, else from the full entry (one shard). */
  async function zeileFuer(id) {
    await stand();
    return zeilen.get(id) ?? null;
  }

  /** Own preview as bytes, or null when the entry has none (404). */
  async function vorschauBild(id) {
    const url = `${vbasis}/${await vorschauPfad(id)}`;
    let res;
    try {
      res = await holen(url, { headers: kopfzeilen });
    } catch (err) {
      throw new FundusFehler(`preview not reachable (${url}): ${err.message}`);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new FundusFehler(`preview not reachable (${url}: HTTP ${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // a single-page host answers a missing file with index.html and status 200: only a real WebP counts
    return istWebp(bytes) ? bytes : null;
  }

  async function info() {
    return (await stand()).stand;
  }

  return { stand, info, suchen, eintrag, zeileFuer, vorschauBild, vorschauUrl: async (id) => `${vbasis}/${await vorschauPfad(id)}`, LIZENZGRUPPEN };
}

/* ---------------- Helpers for the answers ---------------- */

export function groesse(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** The attribution line of an entry; publish writes one for most, the rest get the same shape (TASL). */
export function namensnennung(it) {
  if (it.attribution) return it.attribution;
  const wer = it.creator?.name && it.creator.name !== 'unbekannt' ? ` von ${it.creator.name}` : '';
  return `„${it.title}“${wer}, ${it.source.url}, Lizenz: ${it.license.name}${it.license.url ? ` (${it.license.url})` : ''}`;
}

/** Files of a download: one file, or the files of a package with their relative paths. */
export function dateienVon(d) {
  if (d.paket?.files?.length) return d.paket.files.map((f) => ({ pfad: f.path, url: ohneTracking(f.url) }));
  return [{ pfad: null, url: ohneTracking(d.url) }];
}
