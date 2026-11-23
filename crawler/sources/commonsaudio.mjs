// Wikimedia Commons, audio only (music and sounds). Hotlinking from upload.wikimedia.org is allowed
// (Commons:Reusing content outside Wikimedia/technical) and answers with Access-Control-Allow-Origin: *.
// The API wants a User-Agent with contact details, set FUNDUS_KONTAKT to the site URL. File descriptions
// on Commons are CC BY-SA text, so they are not copied.
//
// Why a category walker (checked live 23.11.2026): search "filetype:audio" finds 4.46 million files, almost all
// of them one-word pronunciations from Lingua Libre; deepcat: is cut off, times out and gets throttled; the
// search offset ends at 10 000. Category members are the only complete, cheap way in. One request lists up to
// 50 subcategories and files (`gcmtype=subcat|file`, in this order), with videoinfo for the files.
//
// Work is spread over runs: data/crawlstand/commonsaudio.json holds a queue of categories with the API's whole
// `continue` object, plus the set of categories already queued. Each run spends at most `cfg.budget` requests;
// the root with the fewest requests so far goes first, so the 50 000 files of "Audio files of music" cannot
// starve the sound roots. When the queue is empty the walk starts again after `cfg.wiederholenNachTagen` days.
// Throttling or errors stop the run and leave the queue as it was.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';
import { stripHtml } from '../lib/schema.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';
const STATE_FILE = 'data/crawlstand/commonsaudio.json';
const PAGE = 50;

const source = {
  id: 'commonsaudio',
  code: 'A1',
  name: 'Wikimedia Commons (Audio)',
  url: 'https://commons.wikimedia.org',
  kinds: ['musik', 'sound'],
  terms: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
};

// Roots, checked live 23.11.2026 (file counts include subcategories). Incompetech, Filmmusic.io, FreePD,
// Musopen and PDsounds already live on Commons and come in through these categories.
export const DEFAULT_ROOTS = {
  musik: [
    'Audio files of music', 'Musopen', 'Audio files of music by source', 'Audio files from Incompetech by subject',
    'Audio files from Filmmusic by subject', 'Audio files from FreePD', 'Free Music Archive', 'Audio files from piano-midi.de', 'MIDI files',
  ],
  sounds: [
    'Audio files of sound effects', 'Sound effects', 'Sounds by type', 'Sounds by source', 'Soundscape', 'Audio files of animal sounds',
    'Xeno-canto', 'PDsounds.org', 'Media from Work With Sounds', 'Audio files from Audiotool',
  ],
};
export const DEFAULT_DEPTH = 5;

const asCategory = (t) => {
  const s = String(t).trim().replace(/_/g, ' ');
  return /^Category:/i.test(s) ? `Category:${s.slice(9).trim()}` : `Category:${s}`;
};

/** [{ kat, art }] in a fixed order, from `musik` and `sounds` lists (or explicit `wurzeln`), or the defaults. */
export function rootsFromConfig(cfg = {}) {
  const out = [];
  const add = (kat, art) => {
    const k = asCategory(kat);
    if (!out.some((r) => r.kat === k)) out.push({ kat: k, art });
  };
  if (Array.isArray(cfg.wurzeln) && cfg.wurzeln.length) {
    for (const w of cfg.wurzeln) if (w?.kategorie && ['musik', 'sound'].includes(w.art)) add(w.kategorie, w.art);
    return out;
  }
  const lists = cfg.musik || cfg.sounds ? { musik: cfg.musik ?? [], sounds: cfg.sounds ?? [] } : DEFAULT_ROOTS;
  for (const k of lists.musik ?? []) add(k, 'musik');
  for (const k of lists.sounds ?? []) add(k, 'sound');
  return out;
}

// ---------------------------------------------------------------------------------------------
// Filters. Spoken-word material is not what this catalogue wants from Commons audio.

const SPOKEN = /\b(pronunciations?|pronounced|spoken|speech(es)?|lingua libre|interviews?|audiobooks?|librivox|podcasts?|lectures?|sermons?|poetry|recitations?|readings? of|oral histor(y|ies)|human voices?|wikisayit|tatoeba|vocaroo|radio programmes?|telephone calls?|news (broadcasts?|reports?)|narrations?|by language)\b/i;
const TITLE_SPOKEN = /^LL-Q\d+|\b(pronunciation|aussprache|prononciation|pronunciaci[oó]n)\b/i;
// Language-code prefix of a one-word recording ("De-Hund.ogg"); only for very short files.
const LANG_PREFIX = /^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?-/;

export const isSpokenCategory = (name) => SPOKEN.test(String(name).replace(/^Category:/, '').replace(/_/g, ' '));

// Files that sit in a sound-effects and a music tree get the same kind in every run: the file's own
// categories decide, the root it was found through only when they say nothing.
const SOUND_CATS = /sound effects?|soundscapes?|animal sounds?|xeno-canto|pdsounds|work with sounds|freesound|field recordings?|ambient sounds?|sounds by/i;
const MUSIC_CATS = /\bmusic\b|musopen|incompetech|filmmusic|freepd|piano-midi|\bmidi\b/i;

const PLAYABLE = new Set(['audio/mpeg', 'audio/ogg', 'application/ogg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/flac', 'audio/x-flac', 'audio/webm', 'audio/opus']);
const NO_LICENSE = /no (known )?(copyright )?restrictions/i;

const metaValue = (em, key) => em?.[key]?.value;
const categoriesOf = (info) => (metaValue(info?.extmetadata, 'Categories') ?? '').split('|').filter(Boolean);

/** The video/audio info of a page, or null. */
const infoOf = (page) => page?.videoinfo?.[0] ?? page?.imageinfo?.[0] ?? null;

export function isAudio(info) {
  if (!info?.url) return false;
  if (info.mediatype) return info.mediatype === 'AUDIO';
  const mime = info.mime ?? '';
  return /^audio\//.test(mime) || (mime === 'application/ogg' && !info.width);
}

/** The URL of a file without Commons' utm tracking parameters (keeps the dedupe key against Openverse equal). */
export function cleanUrl(u) {
  try {
    const p = new URL(u);
    p.search = '';
    p.hash = '';
    return p.href;
  } catch {
    return u;
  }
}

function mp3Of(info) {
  return (info.derivatives ?? []).find((d) => d.transcodekey === 'mp3' && d.src)?.src ?? null;
}

/** Playable preview: the transcoded MP3 (always the same URL scheme, CORS *), else a browser-playable original. */
export function previewUrl(info) {
  const mp3 = mp3Of(info);
  if (mp3) return cleanUrl(mp3);
  return PLAYABLE.has(info.mime) ? cleanUrl(info.url) : null;
}

export function kindOf(info, fallback) {
  const cats = categoriesOf(info).join('|');
  if (SOUND_CATS.test(cats)) return 'sound';
  if (MUSIC_CATS.test(cats)) return 'musik';
  return fallback;
}

/**
 * One page of the category query → catalogue entry, or null.
 * @param page  page object from generator=categorymembers with prop=videoinfo
 * @param art   kind of the root the file was found through ('musik' | 'sound')
 */
export function parsePage(page, art = 'musik') {
  const info = infoOf(page);
  if (page?.ns !== 6 || !isAudio(info)) return null;
  const em = info.extmetadata ?? {};
  const fileTitle = String(page.title).replace(/^File:/, '');
  const base = fileTitle.replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
  const duration = Number(info.duration);
  if (TITLE_SPOKEN.test(fileTitle)) return null;
  if (duration < 10 && LANG_PREFIX.test(fileTitle)) return null;
  const cats = categoriesOf(info);
  if (cats.some(isSpokenCategory)) return null;

  const shortName = metaValue(em, 'LicenseShortName');
  const licenseUrl = metaValue(em, 'LicenseUrl');
  if (!licenseUrl && NO_LICENSE.test(shortName ?? '')) return null;
  const preview = previewUrl(info);
  if (!preview) return null;

  const artistHtml = metaValue(em, 'Artist') ?? '';
  const artistLink = artistHtml.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
  const original = cleanUrl(info.url);
  const ext = (fileTitle.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
  const downloads = [{ label: 'Originaldatei', url: original, format: ext || undefined, size: info.size }];
  const mp3 = mp3Of(info);
  if (mp3 && cleanUrl(mp3) !== original) downloads.push({ label: 'MP3 (von Commons umgewandelt)', url: cleanUrl(mp3), format: 'mp3' });

  return makeItem(source, {
    sourceId: page.pageid,
    kind: kindOf(info, art),
    title: stripHtml(metaValue(em, 'ObjectName') || base),
    // Commons categories mix topics with maintenance lists; only the topical ones become tags.
    tags: cats
      .filter((c) => !/licen|cc-|pd-|gfdl|self-published|pages |files |uploaded|transferred|sound files|audio files|media |ogg|created with|pdsounds|undelete|\bby\b|unknown date|author died|more than \d+ years|^\d{4} works|music in \d{4}/i.test(c))
      .map((c) => c.replace(/_/g, ' '))
      .slice(0, 8),
    creator: {
      name: stripHtml(artistHtml).replace(/^(composer|artist|author|performer|performed by):\s*/i, '') || 'unbekannt',
      // Red links point to user pages that do not exist.
      url: artistLink && !/redlink=1/.test(artistLink) ? (artistLink.startsWith('//') ? `https:${artistLink}` : artistLink) : undefined,
    },
    landing: info.descriptionurl,
    license: licenseUrl || shortName,
    preview: { type: 'audio', url: preview },
    downloads,
    meta: duration > 0 ? { dauer: `${Math.max(1, Math.round(duration))} s` } : undefined,
    hashes: info.sha1 ? { sha1: info.sha1 } : undefined,
  });
}

// ---------------------------------------------------------------------------------------------
// Crawl state (pure functions, tested in tests/adapters-audio.test.mjs).
//
// state = {
//   version: 1, zyklus: 1, start: "2026-11-23", fertigAm?: "2026-11-24",
//   wurzeln: ["Category:…"],                       roots already queued (config order at the time)
//   besucht: { "Category:…": 1 },                  every category ever queued in this cycle
//   seiten: { "Category:…": 12 },                  requests per root, for fair scheduling
//   warteschlange: [{ k, a, r, d, weiter }]        k category, a art, r root, d depth, weiter = API continue or null
// }

export function emptyState(heute) {
  return { version: 1, zyklus: 1, start: heute, wurzeln: [], besucht: {}, seiten: {}, warteschlange: [] };
}

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** Queues roots the state has not seen yet; restarts a finished walk after `wiederholenNachTagen` days. */
export function prepareState(state, roots, { heute, wiederholenNachTagen = 30 }) {
  let st = structuredClone(state && state.version === 1 && state.besucht ? state : emptyState(heute));
  const wait = Math.max(1, Number(wiederholenNachTagen) || 30);
  if (st.fertigAm && !st.warteschlange.length && daysBetween(st.fertigAm, heute) >= wait) {
    st = { ...emptyState(heute), zyklus: (st.zyklus ?? 1) + 1 };
  }
  for (const { kat, art } of roots) {
    if (st.wurzeln.includes(kat)) continue;
    st.wurzeln.push(kat);
    if (!st.besucht[kat]) {
      st.besucht[kat] = 1;
      st.warteschlange.push({ k: kat, a: art, r: kat, d: 0, weiter: null });
      st.seiten[kat] ??= 0;
      delete st.fertigAm;
    }
  }
  return st;
}

/** Entry of the root with the fewest requests so far; within a root the oldest entry (breadth first). */
export function nextEntry(state) {
  let best = null;
  const seen = new Set();
  for (const e of state.warteschlange) {
    if (seen.has(e.r)) continue;
    seen.add(e.r);
    const n = state.seiten[e.r] ?? 0;
    if (!best || n < best.n) best = { e, n };
  }
  return best?.e ?? null;
}

/**
 * Folds one answered request into the state: queues new subcategories, advances or removes the entry.
 * `cont` is the response's whole continue object.
 */
export function applyResponse(state, entry, pages, cont, { tiefe = DEFAULT_DEPTH, ausschluss = new Set(), now = new Date().toISOString() } = {}) {
  const st = structuredClone(state);
  const i = st.warteschlange.findIndex((e) => e.k === entry.k);
  if (i < 0) return st;
  st.seiten[entry.r] = (st.seiten[entry.r] ?? 0) + 1;
  for (const p of pages ?? []) {
    if (p.ns !== 14 || !p.title || st.besucht[p.title]) continue;
    st.besucht[p.title] = 1;
    if (entry.d + 1 > tiefe || isSpokenCategory(p.title) || ausschluss.has(p.title)) continue;
    st.warteschlange.push({ k: p.title, a: entry.a, r: entry.r, d: entry.d + 1, weiter: null });
  }
  if (cont && Object.keys(cont).length) st.warteschlange[i].weiter = cont;
  else st.warteschlange.splice(i, 1);
  if (!st.warteschlange.length) st.fertigAm = now.slice(0, 10);
  return st;
}

/** A category that does not exist (or cannot be listed) leaves the queue without results. */
export function dropEntry(state, entry, now = new Date().toISOString()) {
  const st = structuredClone(state);
  st.warteschlange = st.warteschlange.filter((e) => e.k !== entry.k);
  if (!st.warteschlange.length) st.fertigAm = now.slice(0, 10);
  return st;
}

export function requestParams(entry) {
  return {
    action: 'query',
    format: 'json',
    formatversion: 2,
    maxlag: 5,
    generator: 'categorymembers',
    gcmtitle: entry.k,
    // Order matters: "subcat|file" lists subcategories first, "file|subcat" did not return them (checked live).
    gcmtype: 'subcat|file',
    gcmlimit: PAGE,
    prop: 'videoinfo',
    viprop: 'url|size|mime|mediatype|sha1|derivatives|extmetadata',
    viextmetadatafilter: 'ObjectName|Artist|LicenseShortName|LicenseUrl|Categories',
    ...(entry.weiter ?? {}),
  };
}

async function loadState(path) {
  try {
    const st = JSON.parse(await readFile(path, 'utf8'));
    if (st && st.version === 1 && st.besucht) return st;
  } catch {}
  return null;
}

async function saveState(path, st) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(st));
  await rename(tmp, path);
}

source.crawl = async function crawl(cfg = {}, log = () => {}) {
  setHostGap('commons.wikimedia.org', Number(cfg.abstand) >= 0 && cfg.abstand != null ? Number(cfg.abstand) : 1000);
  const heute = new Date().toISOString().slice(0, 10);
  const roots = rootsFromConfig(cfg);
  const budget = Math.max(0, Number(cfg.budget) || 300);
  const tiefe = cfg.tiefe != null && Number.isFinite(Number(cfg.tiefe)) ? Number(cfg.tiefe) : DEFAULT_DEPTH;
  const ausschluss = new Set((cfg.ausschluss ?? []).map(asCategory));
  const statePath = cfg.stand ?? STATE_FILE;
  const deadline = Date.now() + (Number(cfg.maxMinuten) || 40) * 60000;

  let state = prepareState(await loadState(statePath), roots, { heute, wiederholenNachTagen: cfg.wiederholenNachTagen });
  const found = new Map();
  let used = 0;
  let stop = null;

  try {
    while (used < budget && !stop) {
      const entry = nextEntry(state);
      if (!entry) break;
      if (Date.now() > deadline) {
        stop = 'Zeitlimit erreicht';
        break;
      }
      used++;
      let data;
      try {
        data = await getJson(`${API}?${q(requestParams(entry))}`, { timeout: 60000 });
      } catch (err) {
        // 429, 5xx, timeouts and the plain-text "too many requests" answer: the next requests would fail the same way.
        stop = `${entry.k}: ${err.message}`;
        break;
      }
      if (data.error) {
        if (data.error.code === 'maxlag') {
          stop = `${entry.k}: Server ausgelastet (maxlag)`;
          break;
        }
        log(`  commonsaudio ${entry.k}: ${data.error.code}`);
        state = dropEntry(state, entry);
        continue;
      }
      const pages = data.query?.pages ?? [];
      for (const page of pages) {
        const it = parsePage(page, entry.a);
        if (it) found.set(it.id, it);
      }
      state = applyResponse(state, entry, pages, data.continue, { tiefe, ausschluss });
      if (used % 25 === 0) await saveState(statePath, state);
    }
  } finally {
    await saveState(statePath, state);
  }

  if (stop) log(`  commonsaudio: Lauf abgebrochen (${stop})`);
  log(`  commonsaudio: ${used}/${budget} Anfragen, ${found.size} Dateien, ${state.warteschlange.length} Kategorien in der Warteschlange, ${Object.keys(state.besucht).length} bekannt, Zyklus ${state.zyklus}`);
  return [...found.values()];
};

export default source;
