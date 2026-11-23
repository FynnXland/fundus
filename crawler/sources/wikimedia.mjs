// Wikimedia Commons. Hotlinking from upload.wikimedia.org and thumb.wikimedia.org is allowed
// (Commons:Reusing content outside Wikimedia/technical); both answer with Access-Control-Allow-Origin: *.
// The API wants a User-Agent with contact details, set FUNDUS_KONTAKT to the site URL. File descriptions
// on Commons are CC BY-SA text, so they are not copied.
//
// Query groups (checked live 23.11.2026 with prop=categoryinfo and samples of the members):
//   Category:Featured_pictures_on_Wikimedia_Commons       ~22 800 files   bild
//   Category:Valued_images_sorted_by_promotion_date       ~56 600 files   bild
//   Category:Quality_images                               ~474 900 files  bild
//   Category:PD_OpenClipart                               ~2 960 files    grafik (flags, arms, logos, icons dropped)
//   Category:Images_from_openclipart.org                  ~185 files      grafik
//   Category:Tileable_textures                            ~300 files      textur (seamless surface textures)
//   Category:Seamless_patterns                            ~70 files       textur
//   search "filetype:3d -intitle:Noto"                    ~7 800 files    3d (STL; ~4 100 font glyph STLs left out)
// Not used: Category:Textures (photos of textured things, not tiles), Category:Mosaic_textures (photos of
// mosaics), Category:Illustrations (mixed photos and posters), featured/quality SVGs (mostly diagrams and arms).
//
// Work is spread over runs: data/crawlstand/wikimedia.json keeps the API's whole `continue` object per group.
// Each run spends at most `cfg.budget` requests, least-advanced group first. A finished group starts again
// after `cfg.wiederholenNachTagen` days (never on the day it finished), which picks up files added since.
// Full-text search only serves the first 10 000 hits (cirrussearch-offset-too-large), so search groups end there.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';
import { stripHtml } from '../lib/schema.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';
const STATE_FILE = 'data/crawlstand/wikimedia.json';
export const SEARCH_MAX = 10000;
const PAGE = 50;

const source = {
  id: 'wikimedia',
  code: 'WM',
  name: 'Wikimedia Commons',
  url: 'https://commons.wikimedia.org',
  kinds: ['bild', 'grafik', 'textur', '3d'],
  terms: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
};

export const DEFAULT_GROUPS = [
  { id: 'exzellent', art: 'bild', kategorie: 'Category:Featured_pictures_on_Wikimedia_Commons' },
  { id: 'wertvoll', art: 'bild', kategorie: 'Category:Valued_images_sorted_by_promotion_date' },
  { id: 'qualitaet', art: 'bild', kategorie: 'Category:Quality_images' },
  { id: 'clipart', art: 'grafik', kategorie: 'Category:PD_OpenClipart' },
  { id: 'clipart-openclipart', art: 'grafik', kategorie: 'Category:Images_from_openclipart.org' },
  { id: 'kacheltexturen', art: 'textur', kategorie: 'Category:Tileable_textures' },
  { id: 'nahtlose-muster', art: 'textur', kategorie: 'Category:Seamless_patterns' },
  { id: '3d', art: '3d', suche: 'filetype:3d -intitle:Noto' },
];

const meta = (em, key) => em?.[key]?.value;
const categoriesOf = (page) => (meta(page.imageinfo?.[0]?.extmetadata, 'Categories') ?? '').split('|').filter(Boolean);
const catName = (c) => String(c).replace(/^Category:/, '').replace(/_/g, ' ').toLowerCase();

const MIME_3D = /^(application\/sla|model\/stl|application\/vnd\.ms-pki\.stl)$/;
const is3d = (info) => info?.mediatype === '3D' || MIME_3D.test(info?.mime ?? '');
const isImage = (info) => /^image\//.test(info?.mime ?? '');

// Clipart groups also hold flags, coats of arms and logos; those are neither clipart nor free of
// trademark questions, and icons and diagrams have their own kinds elsewhere.
const NOT_CLIPART = /\bflags?\b|coats? of arms|heraldr|insigni|emblems?\b|\bseals? of|\blogos?\b|trademark|\bicons?\b|diagram|\bmaps?\b|\bcharts?\b/i;
const NOT_3D = /\blogos?\b|trademark/i;

/** Whether a Commons file may be listed as this kind. */
export function allowedAs(kind, page) {
  const info = page?.imageinfo?.[0];
  if (!info) return false;
  const cats = categoriesOf(page).join('|');
  if (kind === '3d') return is3d(info) && !NOT_3D.test(cats);
  if (!isImage(info)) return false;
  if (kind === 'grafik') return /^image\/(svg\+xml|png|gif|webp)$/.test(info.mime) && !NOT_CLIPART.test(cats);
  if (kind === 'textur') return /^image\/(jpeg|png|webp|tiff|svg\+xml)$/.test(info.mime);
  return true;
}

const KIND_RANK = { '3d': 3, textur: 2, grafik: 1, bild: 0 };

/**
 * Decides the kind of a file independently of the group it was found through, so a file listed in
 * several groups always gets the same kind: the most specific group whose category the file carries
 * wins, 3D files are always 3d. Returns null when the file does not fit the group it came from.
 */
export function kindFor(page, groups, groupArt = 'bild') {
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  if (is3d(info)) return allowedAs('3d', page) ? '3d' : null;
  const cats = new Set(categoriesOf(page).map(catName));
  const candidates = groups
    .filter((g) => g.kategorie && g.art !== 'bild' && cats.has(catName(g.kategorie)))
    .map((g) => g.art)
    .sort((a, b) => KIND_RANK[b] - KIND_RANK[a]);
  for (const k of candidates) if (allowedAs(k, page)) return k;
  if (groupArt === 'bild' && allowedAs('bild', page)) return 'bild';
  return null;
}

// "No restrictions" (Flickr Commons, British Library) is not an open licence.
const NO_LICENSE = /no (known )?(copyright )?restrictions/i;

const FORMAT = { 'image/svg+xml': 'svg', 'application/sla': 'stl', 'model/stl': 'stl', 'application/vnd.ms-pki.stl': 'stl' };
const formatOf = (mime) => FORMAT[mime] ?? mime.split('/')[1];

// The detail view gets a 960 px rendering (one of the standard widths Commons serves) instead of the
// original, which can be tens of megabytes. The API names that rendering in responsiveUrls["2"]; for files
// narrower than 960 px it points to the original. Without it the thumbnail width is rewritten.
function bigPreview(info) {
  const r2 = info.responsiveUrls?.['2'];
  if (r2) return r2;
  if (info.thumburl && /\/thumb\//.test(info.thumburl)) return info.thumburl.replace(/\/\d+px-/, '/960px-');
  return isImage(info) && !/svg/.test(info.mime) ? info.url : info.thumburl;
}

const DOWNLOAD_LABEL = { svg: 'SVG-Datei (Vektor)', stl: 'STL-Datei (3D-Modell)' };

/**
 * One page of an imageinfo query → catalogue entry, or null.
 * @param page  page object from prop=imageinfo with extmetadata
 * @param kind  'bild' (default), 'grafik', 'textur' or '3d'
 */
export function parsePage(page, kind = 'bild') {
  const info = page?.imageinfo?.[0];
  if (!info || !allowedAs(kind, page)) return null;
  const em = info.extmetadata ?? {};
  const fileTitle = page.title.replace(/^File:/, '');
  const title = stripHtml(meta(em, 'ObjectName') || fileTitle.replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' '));
  const artistHtml = meta(em, 'Artist') ?? '';
  const artistLink = artistHtml.match(/href="([^"]+)"/)?.[1];
  const shortName = meta(em, 'LicenseShortName');
  const licenseUrl = meta(em, 'LicenseUrl');
  if (!licenseUrl && NO_LICENSE.test(shortName ?? '')) return null;
  if (!info.thumburl) return null;
  const format = formatOf(info.mime);
  return makeItem(source, {
    sourceId: page.pageid,
    kind,
    title,
    // Commons categories mix topics with maintenance lists; only the topical ones become tags.
    tags: categoriesOf(page)
      .filter((c) => !/licen|cc-|pd-|gfdl|featured|quality|valued|self-published|pages |files |uploaded|taken with|picture of the|media |images with|photographs by|supported by|wiki loves|created with|openclipart|undelete|stl files|tileable|seamless/i.test(c))
      .map((c) => c.replace(/_/g, ' '))
      .slice(0, 8),
    creator: {
      name: stripHtml(artistHtml) || 'unbekannt',
      url: artistLink ? (artistLink.startsWith('//') ? `https:${artistLink}` : artistLink) : undefined,
    },
    landing: info.descriptionurl,
    license: licenseUrl || shortName,
    // STL and SVG files get the PNG rendering Commons makes of them; the viewer only reads glTF.
    preview: { type: 'image', thumb: info.thumburl, url: bigPreview(info) },
    downloads: [{ label: DOWNLOAD_LABEL[format] ?? 'Originaldatei', url: info.url, format, size: info.size }],
    // A 3D file reports the size of its rendering, not of the model.
    meta: info.width && kind !== '3d' ? { abmessung: `${info.width} × ${info.height} px` } : undefined,
    hashes: info.sha1 ? { sha1: info.sha1 } : undefined,
  });
}

// ---------------------------------------------------------------------------------------------
// Groups from the config. The old shape { kategorien: [...], limit } still works (picture groups,
// budget from limit) until config.json carries `gruppen`.

export function groupsFromConfig(cfg = {}) {
  if (Array.isArray(cfg.gruppen) && cfg.gruppen.length) {
    return cfg.gruppen
      .filter((g) => g && g.id && (g.kategorie || g.suche) && ['bild', 'grafik', 'textur', '3d'].includes(g.art ?? 'bild'))
      .map((g) => ({ id: String(g.id), art: g.art ?? 'bild', ...(g.kategorie ? { kategorie: g.kategorie } : { suche: g.suche }) }));
  }
  if (Array.isArray(cfg.kategorien) && cfg.kategorien.length) {
    return cfg.kategorien.map((k) => ({ id: catName(k).replace(/\s+/g, '-'), art: 'bild', kategorie: k }));
  }
  return DEFAULT_GROUPS.map((g) => ({ ...g }));
}

export function budgetFromConfig(cfg = {}, groups = groupsFromConfig(cfg)) {
  if (Number(cfg.budget) > 0) return Math.floor(Number(cfg.budget));
  if (!cfg.gruppen && Number(cfg.limit) > 0) return Math.ceil(Number(cfg.limit) / PAGE) * groups.length;
  return 300;
}

const originOf = (g) => (g.kategorie ? `kategorie:${g.kategorie}` : `suche:${g.suche}`);

// ---------------------------------------------------------------------------------------------
// Crawl state (pure functions, tested in tests/adapters-bilder.test.mjs).
//
// state = {
//   version: 1,
//   gruppen: {
//     "exzellent": { quelle: "kategorie:Category:…", weiter: { gcmcontinue, continue } | null,
//                    seiten: 12, fertig: false, fertigAm?: "2026-11-23", zuletzt?: ISO, fehler?: text, runde: 1 }
//   }
// }
// `weiter` is the API's whole continue object for the next page (null = start of the group),
// `seiten` the pages fetched in the current round.

export function emptyState() {
  return { version: 1, gruppen: {} };
}

const freshEntry = (g, runde = 1) => ({ quelle: originOf(g), weiter: null, seiten: 0, fertig: false, runde });

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * Adds missing groups, resets groups whose category or query changed, and starts finished groups
 * again once `wiederholenNachTagen` days have passed (at least one).
 */
export function prepareState(state, groups, { heute, wiederholenNachTagen = 14 }) {
  const st = structuredClone(state && state.version === 1 && state.gruppen ? state : emptyState());
  const wait = Math.max(1, Number(wiederholenNachTagen) || 14);
  for (const g of groups) {
    const e = st.gruppen[g.id];
    if (!e || e.quelle !== originOf(g)) {
      st.gruppen[g.id] = freshEntry(g);
    } else if (e.fertig && e.fertigAm && daysBetween(e.fertigAm, heute) >= wait) {
      st.gruppen[g.id] = freshEntry(g, (e.runde ?? 1) + 1);
    }
  }
  return st;
}

/** The unfinished group with the fewest pages in its round (config order breaks ties), or null. */
export function nextGroup(state, groups) {
  let best = null;
  for (const g of groups) {
    const e = state.gruppen[g.id];
    if (!e || e.fertig) continue;
    if (!best || e.seiten < state.gruppen[best.id].seiten) best = g;
  }
  return best;
}

/** Folds one answered page into the state. `cont` is the response's continue object (or undefined). */
export function applyPage(state, id, cont, now = new Date().toISOString()) {
  const st = structuredClone(state);
  const e = st.gruppen[id];
  e.seiten += 1;
  e.zuletzt = now;
  delete e.fehler;
  const offset = Number(cont?.gsroffset);
  if (!cont || (Number.isFinite(offset) && offset >= SEARCH_MAX)) {
    e.weiter = null;
    e.fertig = true;
    e.fertigAm = now.slice(0, 10);
  } else {
    e.weiter = cont;
  }
  return st;
}

/**
 * The API refused a request. A refused continuation (stale token) starts the group over;
 * a refused first page ends the group for this round.
 */
export function applyError(state, id, code, now = new Date().toISOString()) {
  const st = structuredClone(state);
  const e = st.gruppen[id];
  e.zuletzt = now;
  e.fehler = code;
  if (e.weiter && code !== 'cirrussearch-offset-too-large') {
    e.weiter = null;
    e.seiten = 0;
  } else {
    e.weiter = null;
    e.fertig = true;
    e.fertigAm = now.slice(0, 10);
  }
  return st;
}

/** Request parameters for the next page of a group. */
export function requestParams(group, weiter) {
  const base = {
    action: 'query',
    format: 'json',
    formatversion: 2,
    maxlag: 5,
    prop: 'imageinfo',
    iiprop: 'url|mime|mediatype|size|sha1|extmetadata',
    iiurlwidth: 480,
    iiextmetadatafilter: 'ObjectName|Artist|LicenseShortName|LicenseUrl|Categories',
  };
  const gen = group.kategorie
    ? { generator: 'categorymembers', gcmtitle: group.kategorie, gcmtype: 'file', gcmlimit: PAGE, gcmsort: 'timestamp', gcmdir: 'desc' }
    : // Oldest first: new uploads land at the end, so the offsets of a running round stay put.
      { generator: 'search', gsrsearch: group.suche, gsrnamespace: 6, gsrlimit: PAGE, gsrsort: 'create_timestamp_asc' };
  return { ...base, ...gen, ...(weiter ?? {}) };
}

/** Keeps one entry per file; a more specific kind wins (it can only differ for odd category data). */
export function addUnique(map, it) {
  const old = map.get(it.id);
  if (!old || KIND_RANK[it.kind] > KIND_RANK[old.kind]) map.set(it.id, it);
}

async function loadState(path) {
  try {
    const st = JSON.parse(await readFile(path, 'utf8'));
    if (st && st.version === 1 && st.gruppen) return st;
  } catch {}
  return emptyState();
}

async function saveState(path, st) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(st, null, 1));
  await rename(tmp, path);
}

source.crawl = async function crawl(cfg = {}, log = () => {}) {
  setHostGap('commons.wikimedia.org', 1000);
  const heute = new Date().toISOString().slice(0, 10);
  const groups = groupsFromConfig(cfg);
  const budget = budgetFromConfig(cfg, groups);
  const statePath = cfg.stand ?? STATE_FILE;
  const deadline = Date.now() + (Number(cfg.maxMinuten) || 40) * 60000;

  let state = prepareState(await loadState(statePath), groups, { heute, wiederholenNachTagen: cfg.wiederholenNachTagen });
  const found = new Map();
  let used = 0;
  let stop = null;

  try {
    while (used < budget && !stop) {
      const g = nextGroup(state, groups);
      if (!g) break;
      if (Date.now() > deadline) {
        stop = 'Zeitlimit erreicht';
        break;
      }
      used++;
      let data;
      try {
        data = await getJson(`${API}?${q(requestParams(g, state.gruppen[g.id].weiter))}`, { timeout: 60000 });
      } catch (err) {
        // 429, 5xx, timeouts: the next requests would fail the same way.
        stop = `${g.id}: ${err.message}`;
        break;
      }
      if (data.error) {
        if (data.error.code === 'maxlag') {
          stop = `${g.id}: Server ausgelastet (maxlag)`;
          break;
        }
        log(`  wikimedia ${g.id}: ${data.error.code}`);
        state = applyError(state, g.id, data.error.code);
        continue;
      }
      for (const page of data.query?.pages ?? []) {
        const kind = kindFor(page, groups, g.art);
        const it = kind && parsePage(page, kind);
        if (it) addUnique(found, it);
      }
      state = applyPage(state, g.id, data.continue);
      if (used % 25 === 0) await saveState(statePath, state);
    }
  } finally {
    await saveState(statePath, state);
  }

  const done = groups.filter((g) => state.gruppen[g.id]?.fertig).length;
  if (stop) log(`  wikimedia: Lauf abgebrochen (${stop})`);
  log(`  wikimedia: ${used}/${budget} Anfragen, ${found.size} Dateien, ${done}/${groups.length} Gruppen in dieser Runde fertig`);
  return [...found.values()];
};

export default source;
