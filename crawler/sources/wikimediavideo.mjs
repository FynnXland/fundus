// Wikimedia Commons, videos. Same licence rules and hotlinking permission as the image adapter
// (wikimedia.mjs, Commons:Reusing content outside Wikimedia/technical). Commons transcodes every video to
// VP9 WebM (240p to 1080p) and a small MPEG-4 file; those derivatives and the original are linked directly.
// Posters come from thumb.wikimedia.org (new host since 2026, the image adapter still sees upload.wikimedia.org).
//
// Search (checked 23.11.2026): `filetype:video filew:>1279 <term>` finds about 208,000 HD videos. CirrusSearch
// answers at most 10,000 results per query (error "cirrussearch-offset-too-large" beyond), so the crawl
// works per term, in stages: data/crawlstand/wikimediavideo.json remembers the next offset per term and
// each run spends at most `cfg.budget` requests of 50 files.
//
// Commons has no "mature" flag, and a plain topic search also finds news and police footage. Titles and
// categories that point to violence, death or nudity are dropped (SENSIBEL); file descriptions are
// CC BY-SA text and are not copied.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';
import { stripHtml } from '../lib/schema.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';
const STATE_FILE = 'data/crawlstand/wikimediavideo.json';
export const MAX_OFFSET = 10000;
const PAGE = 50;

const source = {
  id: 'wikimediavideo',
  code: 'WV',
  name: 'Wikimedia Commons',
  url: 'https://commons.wikimedia.org',
  kinds: ['video'],
  terms: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
};

const meta = (em, key) => em?.[key]?.value;

export const SENSIBEL = /\b(bodycam|body cam|body-worn|police shooting|shooting of|shot dead|killed|killing|murder|corpse|dead body|execution|beheading|massacre|war crime|torture|suicide|nude|nudity|sexual|porn|erotic|genital)/i;

/** Removes the utm_* tracking parameters the API adds to every file and thumbnail URL. */
export function cleanUrl(u) {
  if (!u) return u;
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) if (/^utm_/i.test(k)) url.searchParams.delete(k);
    return url.toString();
  } catch {
    return u;
  }
}

/** Best transcode of a kind: highest height up to 1080 lines. kind 'webm' = VP9 WebM, 'mp4' = MPEG-4. */
export function bestDerivative(derivatives = [], kind) {
  const isKind = (d) => (kind === 'webm' ? /video\/webm/.test(d.type ?? '') : /mpeg4|mp4/.test(d.transcodekey ?? '') || /video\/mp4/.test(d.type ?? ''));
  return derivatives
    .filter((d) => d?.src && isKind(d) && (d.height ?? 0) <= 1080)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0] ?? null;
}

/** Smaller WebM for the player in the detail view: 720p or 480p, otherwise the best there is. */
function playerDerivative(derivatives = []) {
  const webm = derivatives.filter((d) => d?.src && /video\/webm/.test(d.type ?? ''));
  return webm.find((d) => d.height === 720) ?? webm.find((d) => d.height === 480) ?? bestDerivative(derivatives, 'webm');
}

const extOf = (url) => (url.match(/\.([a-z0-9]+)(?:$|\?)/i)?.[1] ?? '').toLowerCase();

export function parseVideo(page) {
  const info = page.videoinfo?.[0] ?? page.imageinfo?.[0];
  if (!info || info.mediatype !== 'VIDEO') return null;
  const em = info.extmetadata ?? {};
  const fileTitle = page.title.replace(/^File:/, '');
  const title = stripHtml(meta(em, 'ObjectName') || fileTitle.replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' '));
  const categories = (meta(em, 'Categories') ?? '').split('|').filter(Boolean);
  if (SENSIBEL.test(`${title} ${fileTitle} ${categories.join(' ')}`)) return null;

  const artistHtml = meta(em, 'Artist') ?? '';
  const artistLink = artistHtml.match(/href="([^"]+)"/)?.[1];
  const original = cleanUrl(info.url);
  const webm = bestDerivative(info.derivatives, 'webm');
  const mp4 = bestDerivative(info.derivatives, 'mp4');
  const player = playerDerivative(info.derivatives);
  const poster = cleanUrl(info.responsiveUrls?.['2'] ?? info.thumburl);

  const downloads = [{ label: 'Originaldatei', url: original, format: extOf(original) || undefined, size: info.size || undefined }];
  if (webm) downloads.push({ label: `WebM ${webm.height}p (von Commons umgewandelt)`, url: cleanUrl(webm.src), format: 'webm' });
  if (mp4) downloads.push({ label: `MPEG-4 ${mp4.height}p (von Commons umgewandelt)`, url: cleanUrl(mp4.src), format: extOf(mp4.src) || 'mp4' });

  const m = {};
  if (info.width && info.height) m.abmessung = `${info.width} × ${info.height} px`;
  if (Number(info.duration) > 0) m.dauer = `${Math.round(info.duration)} s`;
  if (/featured|quality/i.test(meta(em, 'Assessments') ?? '')) m.auszeichnung = meta(em, 'Assessments');

  return makeItem(source, {
    sourceId: page.pageid,
    kind: 'video',
    title,
    tags: categories
      .filter((c) => !/licen|cc-|^pd[ -]|pd-|gfdl|featured|quality|valued|self-published|pages |files |uploaded|taken with|media |videos with|videos by|supported by|wiki loves|webm|ogv|transcod/i.test(c))
      .map((c) => c.replace(/_/g, ' '))
      .slice(0, 8),
    creator: {
      name: stripHtml(artistHtml) || 'unbekannt',
      url: artistLink ? (artistLink.startsWith('//') ? `https:${artistLink}` : artistLink) : undefined,
    },
    landing: info.descriptionurl,
    license: meta(em, 'LicenseUrl') || meta(em, 'LicenseShortName'),
    // The schema has no video preview yet: the card shows the poster, the playable WebM rides along in
    // preview.video until the detail view can play it (see the report for the orchestrator).
    preview: {
      type: 'image',
      thumb: cleanUrl(info.thumburl),
      url: poster,
      video: player ? { url: cleanUrl(player.src), type: 'video/webm', height: player.height } : undefined,
    },
    downloads,
    meta: Object.keys(m).length ? m : undefined,
    hashes: info.sha1 ? { sha1: info.sha1 } : undefined,
  });
}

export function searchParams(term, offset, { minBreite = 1280 } = {}) {
  return {
    action: 'query',
    format: 'json',
    formatversion: 2,
    generator: 'search',
    gsrnamespace: 6,
    gsrsearch: `filetype:video filew:>${minBreite - 1} ${term}`.trim(),
    gsrlimit: PAGE,
    gsroffset: offset || undefined,
    prop: 'videoinfo',
    viprop: 'url|mime|size|sha1|extmetadata|derivatives|mediatype|dimensions',
    viurlwidth: 480,
    viextmetadatafilter: 'ObjectName|Artist|LicenseShortName|LicenseUrl|Categories|Assessments',
  };
}

// ---------------------------------------------------------------------------------------------
// Crawl state (pure functions, tested in tests/adapters-arten.test.mjs).
// state = { version: 1, zyklus, zyklusStart: "2026-11-23", begriffe: { "<term>": { offset, fertig, zuletzt?, fehler? } } }

export function emptyState(heute) {
  return { version: 1, zyklus: 1, zyklusStart: heute, begriffe: {} };
}

/** Next requests, least advanced terms first. A new cycle starts when all terms are done, never on the same day. */
export function planRequests(state, terms, { budget, heute, maxOffset = MAX_OFFSET }) {
  const st = structuredClone(state ?? emptyState(heute));
  st.begriffe ??= {};
  for (const t of terms) st.begriffe[t] ??= { offset: 0, fertig: false };
  const active = terms.map((t) => ({ term: t, e: st.begriffe[t] }));
  if (active.length && active.every((a) => a.e.fertig) && st.zyklusStart !== heute) {
    for (const t of terms) st.begriffe[t] = { offset: 0, fertig: false };
    st.zyklus = (st.zyklus ?? 0) + 1;
    st.zyklusStart = heute;
  }
  const open = terms.map((t) => ({ term: t, next: st.begriffe[t].offset })).filter((a) => !st.begriffe[a.term].fertig && a.next < maxOffset);
  const requests = [];
  while (requests.length < budget) {
    let best = null;
    for (const a of open) if (a.next < maxOffset && (!best || a.next < best.next)) best = a;
    if (!best) break;
    requests.push({ term: best.term, offset: best.next });
    best.next += PAGE;
  }
  return { state: st, requests };
}

/** Folds one answer into the state. `next` is the offset the API offers to continue with, or undefined. */
export function applyResult(state, term, { next }, now = new Date().toISOString(), maxOffset = MAX_OFFSET) {
  const st = structuredClone(state);
  const e = st.begriffe[term];
  e.zuletzt = now;
  delete e.fehler;
  if (Number.isFinite(next) && next < maxOffset) e.offset = next;
  else {
    e.offset = Number.isFinite(next) ? next : e.offset;
    e.fertig = true;
  }
  return st;
}

async function loadState(path, heute) {
  try {
    const st = JSON.parse(await readFile(path, 'utf8'));
    if (st?.version === 1 && st.begriffe) return st;
  } catch {}
  return emptyState(heute);
}

async function saveState(path, st) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(st, null, 1));
  await rename(`${path}.tmp`, path);
}

source.crawl = async function crawl(cfg, log) {
  setHostGap('commons.wikimedia.org', 1000);
  const heute = new Date().toISOString().slice(0, 10);
  const terms = [...new Set((cfg.begriffe ?? []).map((t) => String(t).trim()).filter(Boolean))];
  const budget = Math.max(0, Number(cfg.budget) || 100);
  const maxDauer = Number(cfg.maxDauer) || Infinity;
  const statePath = cfg.stand ?? STATE_FILE;
  const deadline = Date.now() + (Number(cfg.maxMinuten) || 30) * 60000;

  let state = await loadState(statePath, heute);
  const plan = planRequests(state, terms, { budget, heute });
  state = plan.state;
  const out = [];
  const seen = new Set();
  try {
    for (const req of plan.requests) {
      const e = state.begriffe[req.term];
      if (e.fertig || e.offset !== req.offset) continue;
      if (Date.now() > deadline) {
        log('  wikimediavideo: Zeitlimit erreicht');
        break;
      }
      let data;
      try {
        data = await getJson(`${API}?${q(searchParams(req.term, req.offset, cfg))}`, { timeout: 60000 });
      } catch (err) {
        log(`  wikimediavideo „${req.term}“: ${err.message}`);
        Object.assign(state.begriffe[req.term], { fehler: err.message.slice(0, 160), zuletzt: new Date().toISOString() });
        continue;
      }
      if (data.error) {
        // cirrussearch-offset-too-large and similar: this term is exhausted.
        log(`  wikimediavideo „${req.term}“: ${data.error.code}`);
        state = applyResult(state, req.term, { next: undefined });
        state.begriffe[req.term].fehler = data.error.code;
        continue;
      }
      for (const page of data.query?.pages ?? []) {
        if (seen.has(page.pageid)) continue;
        seen.add(page.pageid);
        const dauer = Number(page.videoinfo?.[0]?.duration);
        if (dauer > maxDauer) continue;
        const it = parseVideo(page);
        if (it) out.push(it);
      }
      state = applyResult(state, req.term, { next: Number(data.continue?.gsroffset) });
    }
  } finally {
    await saveState(statePath, state);
  }
  log(`  wikimediavideo: ${plan.requests.length} Anfragen geplant, ${out.length} Videos`);
  return out;
};

export default source;
