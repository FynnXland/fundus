// Internet Archive, music and field recordings. Licences on archive.org are set by the uploader, so the crawler
// stays in curated collections and accepts only licence URLs from an exact whitelist; ported variants
// (/3.0/us/, /de/ …) and NC/ND are out.
//
// Collections (checked live 23.11.2026, hits with a whitelisted licence):
//   netlabels           ~5 900   musik   releases uploaded by the labels themselves (the former default)
//   radio-aporee-maps   ~58 700  sound   field recordings, one curating uploader (radio aporee), see below
//   freemusicarchive    ~290     musik   Free Music Archive mirror from 2011, uploaded by one archive.org account
//   computoser          ~4 500   musik   computer-composed pieces (CC BY-SA 4.0, one uploader); optional
// Deliberately not used: "audio_music" (commercial releases tagged CC0 or PDM by uploaders), "hifidelity" (game and
// TV music as CC0), "folksoundomy_music", "78rpm" (legal dispute), "jamendo-albums" (Jamendo excluded itself),
// "librivoxaudio" / "opensource_audio" / podcasts and radio (mostly speech).
//
// Access: advancedsearch.php only serves the first 10 000 hits of a query (HTTP 507 DEEP_PAGING after that), and the
// scrape API ignores its query (checked 23.11.2026), so it is not used. Inside the window the crawler sorts by
// addeddate ascending (stable, new items land at the end). A collection with more than 10 000 hits is read from both
// ends, the oldest 10 000 first, then the newest 10 000 (descending); what lies between stays out and is not reached
// by cutting the query into slices.
// No documented rate limit was found; the crawler keeps one request per second on archive.org.
//
// Work is spread over runs: data/crawlstand/internetarchive.json keeps the item offset per collection. Each run
// spends at most `cfg.budget` requests (searches and /metadata/ calls together) and ends in the middle of a page
// if it must; an error on /metadata/ stops the run without advancing, so nothing is skipped.
// Item descriptions, e-mail addresses and recording locations are uploader texts and are not copied.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getJson, setHostGap } from '../lib/http.mjs';
import { bewertung, beliebtheit } from '../lib/bewertung.mjs';
import { makeItem } from '../lib/item.mjs';

const SEARCH = 'https://archive.org/advancedsearch.php';
const STATE_FILE = 'data/crawlstand/internetarchive.json';
const ZIP_MAX = 300e6;
export const WINDOW = 10000;
export const ROWS = 100;

const source = {
  id: 'internetarchive',
  code: 'IA',
  name: 'Internet Archive',
  url: 'https://archive.org',
  kinds: ['musik', 'sound'],
  terms: 'https://archive.org/about/terms',
};

// Exact licence URLs as they occur in the licenseurl field (both schemes are common).
const LICENSE_PATHS = ['publicdomain/zero/1.0/', 'licenses/by/3.0/', 'licenses/by/4.0/', 'licenses/by-sa/3.0/', 'licenses/by-sa/4.0/', 'publicdomain/mark/1.0/'];
export const LICENSE_URLS = LICENSE_PATHS.flatMap((p) => [`http://creativecommons.org/${p}`, `https://creativecommons.org/${p}`]);

const MP3_FORMATS = ['VBR MP3', '128Kbps MP3'];

const first = (v) => (Array.isArray(v) ? v[0] : v);
const fileUrl = (id, name) => `https://archive.org/download/${id}/${name.split('/').map(encodeURIComponent).join('/')}`;

const EMAIL = /<?[\w.+-]+@[\w-]+(?:\.[\w-]+)+>?/g;

/** Removes e-mail addresses from uploader texts (names, titles, tags). */
export function maskEmails(text) {
  return String(text ?? '')
    .replace(EMAIL, '')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;])/g, '$1')
    .replace(/^[\s,;:/|-]+|[\s,;:/|-]+$/g, '')
    .trim();
}

function seconds(length) {
  if (!length) return null;
  const parts = String(length).split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function trackNo(f) {
  const n = parseInt(String(f.track ?? '').split('/')[0], 10);
  return Number.isFinite(n) ? n : Infinity;
}

/** First track of the album: lowest track number, then file name; VBR before 128 kbit/s. */
export function pickMp3(files = []) {
  return files
    .filter((f) => MP3_FORMATS.includes(f.format) && f.name)
    .sort((a, b) => trackNo(a) - trackNo(b) || a.name.localeCompare(b.name) || MP3_FORMATS.indexOf(a.format) - MP3_FORMATS.indexOf(b.format))[0] ?? null;
}

/**
 * @param {object} data  response of https://archive.org/metadata/{identifier}
 * @param {{ kind?: 'musik' | 'sound', stats?: { avg_rating?: number, num_reviews?: number, downloads?: number } }} [opts]
 *   stats: the search hit of the item; avg_rating (1 to 5), num_reviews and downloads come with the search answer
 */
export function parseItem(data, { kind = 'musik', stats } = {}) {
  const m = data?.metadata;
  if (!m?.identifier || !/^[A-Za-z0-9._-]+$/.test(m.identifier)) return null;
  const license = first(m.licenseurl);
  if (!LICENSE_URLS.includes(license)) return null;
  const mp3 = pickMp3(data.files);
  if (!mp3) return null;
  const id = m.identifier;
  // Some netlabel items name the artist only in the file tags.
  const creator = maskEmails([m.creator].flat().filter(Boolean).join(', ') || mp3.creator || mp3.artist);
  const subjects = [m.subject].flat().filter(Boolean).flatMap((s) => String(s).split(/[;,]/)).map((s) => maskEmails(s)).filter(Boolean);

  const downloads = [{ label: `MP3: ${maskEmails(mp3.title) || mp3.name.split('/').pop()}`, url: fileUrl(id, mp3.name), format: 'mp3', size: Number(mp3.size) || undefined }];
  const itemSize = Number(data.item_size);
  if (itemSize > 0 && itemSize < ZIP_MAX) downloads.push({ label: 'Ganzes Item (ZIP)', url: `https://archive.org/compress/${id}`, format: 'zip', size: itemSize });

  const meta = {};
  const dauer = seconds(mp3.length);
  if (dauer) meta.dauer = `${Math.max(1, Math.round(dauer))} s`;
  const tracks = new Set((data.files ?? []).filter((f) => MP3_FORMATS.includes(f.format)).map((f) => f.original || f.name)).size;
  if (tracks > 1) meta.titel = String(tracks);
  const label = [m.collection].flat().find((c) => c && c !== 'netlabels' && !c.startsWith('fav-'));
  if (label) meta.sammlung = label;

  const hashes = {};
  if (/^[0-9a-f]{32}$/.test(mp3.md5 ?? '')) hashes.md5 = mp3.md5;
  if (/^[0-9a-f]{40}$/.test(mp3.sha1 ?? '')) hashes.sha1 = mp3.sha1;

  return makeItem(source, {
    sourceId: id,
    kind,
    title: maskEmails(first(m.title)) || id,
    tags: subjects,
    creator: { name: creator || 'unbekannt' },
    landing: `https://archive.org/details/${id}`,
    license,
    preview: { type: 'audio', url: downloads[0].url, thumb: `https://archive.org/services/img/${id}` },
    downloads,
    meta: Object.keys(meta).length ? meta : undefined,
    hashes: Object.keys(hashes).length ? hashes : undefined,
    ...bewertungVon(id, stats),
  });
}

/** Rating and popularity of an item from its search hit (fields avg_rating, num_reviews, downloads), or nothing. */
export function bewertungVon(id, stats) {
  if (!stats) return {};
  const url = `https://archive.org/details/${id}`;
  return {
    // reviews are 1 to 5 stars; an item without reviews has neither field
    rating: bewertung({ value: stats.avg_rating, min: 1, max: 5, count: stats.num_reviews, name: source.name, url: `${url}#reviews` }),
    popularity: beliebtheit({ value: stats.downloads, label: 'Downloads', name: source.name, url }),
  };
}

/** @param {{ sort?: string }} [opts]  default sort stays "downloads desc" for the old three-argument call */
export function searchUrl(collection, rows, page, { sort = 'downloads desc' } = {}) {
  const licenses = LICENSE_URLS.map((u) => `licenseurl:"${u}"`).join(' OR ');
  const p = new URLSearchParams({ q: `mediatype:audio AND collection:"${collection}" AND (${licenses})` });
  for (const f of ['identifier', 'addeddate', 'avg_rating', 'num_reviews', 'downloads']) p.append('fl[]', f);
  p.append('sort[]', sort);
  p.set('rows', String(rows));
  p.set('page', String(page));
  p.set('output', 'json');
  return `${SEARCH}?${p}`;
}

// ---------------------------------------------------------------------------------------------
// Collections from the config. Old shape: sammlungen: ["netlabels"], limit, maxSeiten (all music).
// New shape: sammlungen: [{ id, art }] with art "musik" or "sound"; both may be mixed.

export function collectionsFromConfig(cfg = {}) {
  const list = Array.isArray(cfg.sammlungen) && cfg.sammlungen.length ? cfg.sammlungen : ['netlabels'];
  const out = [];
  for (const s of list) {
    const id = typeof s === 'string' ? s : s?.id;
    const art = typeof s === 'string' ? 'musik' : s?.art ?? 'musik';
    if (id && /^[A-Za-z0-9._-]+$/.test(id) && ['musik', 'sound'].includes(art) && !out.some((c) => c.id === id)) out.push({ id, art });
  }
  return out;
}

export function budgetFromConfig(cfg = {}) {
  if (Number(cfg.budget) > 0) return Math.floor(Number(cfg.budget));
  if (Number(cfg.limit) > 0) return Math.floor(Number(cfg.limit)) * 2;
  return 400;
}

// ---------------------------------------------------------------------------------------------
// Crawl state (pure functions, tested in tests/adapters-audio.test.mjs).
//
// state = {
//   version: 1,
//   sammlungen: {
//     "netlabels": { art, richtung: "asc" | "desc", offset: 1200, treffer?: 5887, fertig: false, fertigAm?: "2026-11-23", runde: 1, zuletzt?: ISO, fehler?: text }
//   }
// }
// `offset` counts the items already handled in the sort order of `richtung`; the next item is at that position.

export function emptyState() {
  return { version: 1, sammlungen: {} };
}

const fresh = (c, runde = 1) => ({ art: c.art, richtung: 'asc', offset: 0, fertig: false, runde });
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * Adds missing collections and starts finished ones again after `wiederholenNachTagen` days (never the same day).
 * A new round resumes behind the hits seen so far, so it only reads what was added since; a collection that
 * hit the 10 000 window starts its second (newest-first) window again.
 */
export function prepareState(state, collections, { heute, wiederholenNachTagen = 30 }) {
  const st = structuredClone(state && state.version === 1 && state.sammlungen ? state : emptyState());
  const wait = Math.max(1, Number(wiederholenNachTagen) || 30);
  for (const c of collections) {
    const e = st.sammlungen[c.id];
    if (!e) {
      st.sammlungen[c.id] = fresh(c);
    } else if (e.art !== c.art) {
      st.sammlungen[c.id] = fresh(c, e.runde);
    } else if (e.fertig && e.fertigAm && daysBetween(e.fertigAm, heute) >= wait) {
      const capped = (e.treffer ?? 0) > WINDOW;
      st.sammlungen[c.id] = {
        ...fresh(c, (e.runde ?? 1) + 1),
        treffer: e.treffer,
        richtung: capped ? 'desc' : 'asc',
        offset: capped ? 0 : Math.min(e.treffer ?? 0, WINDOW),
      };
    }
  }
  return st;
}

/** Page (1-based) and rows to skip for the next item of a collection. */
export function position(offset) {
  return { page: Math.floor(offset / ROWS) + 1, skip: offset % ROWS };
}

/** Folds the end of a result list into the state: the window or the list is used up. */
export function applyEnd(state, id, { treffer, now = new Date().toISOString() }) {
  const st = structuredClone(state);
  const e = st.sammlungen[id];
  if (Number.isFinite(treffer)) e.treffer = treffer;
  e.zuletzt = now;
  delete e.fehler;
  if (e.richtung === 'asc' && (e.treffer ?? 0) > WINDOW) {
    // Oldest window read; continue with the newest one.
    e.richtung = 'desc';
    e.offset = 0;
  } else {
    e.fertig = true;
    e.fertigAm = now.slice(0, 10);
  }
  return st;
}

export function applyItems(state, id, n, now = new Date().toISOString()) {
  const st = structuredClone(state);
  const e = st.sammlungen[id];
  e.offset += n;
  e.zuletzt = now;
  delete e.fehler;
  return st;
}

export function applyError(state, id, text, now = new Date().toISOString()) {
  const st = structuredClone(state);
  Object.assign(st.sammlungen[id], { fehler: text, zuletzt: now });
  return st;
}

async function loadState(path) {
  try {
    const st = JSON.parse(await readFile(path, 'utf8'));
    if (st && st.version === 1 && st.sammlungen) return st;
  } catch {}
  return emptyState();
}

async function saveState(path, st) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(st, null, 1));
  await rename(tmp, path);
}

const statusOf = (err) => Number(String(err?.message ?? '').match(/HTTP (\d{3})/)?.[1]) || 0;

source.crawl = async function crawl(cfg = {}, log = () => {}) {
  setHostGap('archive.org', Number(cfg.abstand) >= 0 && cfg.abstand != null ? Number(cfg.abstand) : 1000);
  const heute = new Date().toISOString().slice(0, 10);
  const collections = collectionsFromConfig(cfg);
  const budget = budgetFromConfig(cfg);
  const statePath = cfg.stand ?? STATE_FILE;
  const deadline = Date.now() + (Number(cfg.maxMinuten) || 40) * 60000;

  let state = prepareState(await loadState(statePath), collections, { heute, wiederholenNachTagen: cfg.wiederholenNachTagen });
  const out = new Map();
  let used = 0;
  let stop = null;

  try {
    for (let ci = 0; ci < collections.length && !stop; ci++) {
      const c = collections[ci];
      // Every collection with work left gets an equal share of what remains; leftovers flow on to the next one.
      const open = collections.slice(ci).filter((x) => !state.sammlungen[x.id].fertig).length;
      const cap = Math.ceil((budget - used) / Math.max(1, open));
      let spent = 0;

      while (spent < cap && used < budget && !stop && !state.sammlungen[c.id].fertig) {
        const e = state.sammlungen[c.id];
        const { page, skip } = position(e.offset);
        if (page * ROWS > WINDOW) {
          state = applyEnd(state, c.id, {});
          continue;
        }
        if (Date.now() > deadline) {
          stop = 'Zeitlimit erreicht';
          break;
        }
        used++;
        spent++;
        let res;
        try {
          res = (await getJson(searchUrl(c.id, ROWS, page, { sort: `addeddate ${e.richtung}` }))).response ?? {};
        } catch (err) {
          stop = `${c.id}: ${err.message}`;
          state = applyError(state, c.id, err.message.slice(0, 200));
          break;
        }
        const treffer = Number(res.numFound);
        const docs = (res.docs ?? []).slice(skip);
        let handled = 0;
        for (const d of docs) {
          if (used >= budget || spent >= cap || Date.now() > deadline) break;
          used++;
          spent++;
          let data;
          try {
            data = await getJson(`https://archive.org/metadata/${encodeURIComponent(d.identifier)}`);
          } catch (err) {
            // A vanished item is skipped; anything else (429, 5xx, timeout) stops the run before the offset moves.
            if (statusOf(err) === 404) {
              handled++;
              continue;
            }
            stop = `${d.identifier}: ${err.message}`;
            break;
          }
          handled++;
          const it = parseItem(data, { kind: c.art, stats: d });
          if (it) out.set(it.id, it);
        }
        state = applyItems(state, c.id, handled);
        if (stop) {
          state = applyError(state, c.id, stop.slice(0, 200));
          break;
        }
        // The whole (remaining) page is done: end of the list when it came back short or the window is full.
        if (handled === docs.length && (res.docs ?? []).length < ROWS) state = applyEnd(state, c.id, { treffer });
        else if (handled === docs.length && Number.isFinite(treffer)) state.sammlungen[c.id].treffer = treffer;
        if (used % 50 === 0) await saveState(statePath, state);
      }
    }
  } finally {
    await saveState(statePath, state);
  }

  const done = collections.filter((c) => state.sammlungen[c.id].fertig).length;
  if (stop) log(`  internetarchive: Lauf abgebrochen (${stop})`);
  log(`  internetarchive: ${used}/${budget} Anfragen, ${out.size} Einträge, ${done}/${collections.length} Sammlungen in dieser Runde fertig`);
  return [...out.values()];
};

export default source;
