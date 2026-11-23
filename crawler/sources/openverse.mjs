// Openverse indexes openly licensed images and audio from many providers (Flickr, Wikimedia, Freesound,
// Jamendo …). ccMixter is excluded because it blocks hotlinking (403).
//
// Access (checked 23.11.2026 against api.openverse.org/v1/schema and the API source):
//   anonymous            20 requests/min, 200/day, page_size <= 20
//   registered app       100 requests/min, 10000/day, page_size <= 50 (OAuth2 client credentials,
//                        env OPENVERSE_CLIENT_ID + OPENVERSE_CLIENT_SECRET)
//   both                 at most 240 results per query (page * page_size <= 240); deeper pages answer
//                        401 "pagination depth may not exceed 240". The terms forbid scraping, so the
//                        crawler stays inside that window and never invents query variants to get past it.
//
// Work is spread over days: data/crawlstand/openverse.json remembers the next page per (kind, term).
// Each run spends at most `cfg.budget` requests, least-advanced terms first. A term is done when a page
// comes back empty or the last page of the window is reached; when every term is done, the next run
// (not the same day) starts a new cycle, which picks up works added since.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getJson, politeFetch, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';

const API = 'https://api.openverse.org/v1';
const HOST = 'api.openverse.org';
const LICENSES = 'cc0,pdm,by,by-sa';
export const MAX_DEPTH = 240;
const STATE_FILE = 'data/crawlstand/openverse.json';

const PROVIDERS = {
  flickr: 'Flickr', wikimedia: 'Wikimedia Commons', wikimedia_audio: 'Wikimedia Commons', freesound: 'Freesound',
  jamendo: 'Jamendo', stocksnap: 'StockSnap', rawpixel: 'rawpixel', nappy: 'nappy', smithsonian: 'Smithsonian',
  europeana: 'Europeana', nasa: 'NASA', met: 'The Met', clevelandmuseum: 'Cleveland Museum of Art',
};
const providerName = (p) => PROVIDERS[p] ?? (p ? p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Openverse');

const source = {
  id: 'openverse',
  code: 'OV',
  name: 'Openverse',
  url: 'https://openverse.org',
  kinds: ['bild', 'musik', 'sound'],
  terms: 'https://docs.openverse.org/terms_of_service.html',
  // Terms of Service § 4: products built on the API must say so and that Openverse does not endorse them.
  hinweis: 'Erstellt mit Openverse, nicht von Openverse unterstützt oder zertifiziert',
};

export function parseImage(r) {
  if (r.mature) return null;
  return makeItem(source, {
    sourceId: `img/${r.id}`,
    kind: 'bild',
    title: r.title || 'Ohne Titel',
    tags: (r.tags ?? []).map((t) => t.name),
    creator: { name: r.creator || 'unbekannt', url: r.creator_url || undefined },
    originName: providerName(r.source || r.provider),
    via: ['Openverse'],
    landing: r.foreign_landing_url,
    license: r.license,
    licenseVersion: r.license_version,
    preview: { type: 'image', thumb: r.thumbnail, url: r.url },
    downloads: [{ label: 'Originaldatei', url: r.url, format: r.filetype || undefined, size: r.filesize || undefined }],
    meta: r.width && r.height ? { abmessung: `${r.width} × ${r.height} px` } : undefined,
  });
}

export function parseAudio(r, kind) {
  if (r.mature) return null;
  const provider = r.source || r.provider;
  // Freesound only lets logged-in users download originals; the hq mp3 preview is what can be linked.
  const label = provider === 'freesound' ? 'MP3 (Hörprobe in hoher Qualität)' : 'Audiodatei';
  return makeItem(source, {
    sourceId: `audio/${r.id}`,
    kind,
    title: r.title || 'Ohne Titel',
    tags: (r.tags ?? []).map((t) => t.name),
    creator: { name: r.creator || 'unbekannt', url: r.creator_url || undefined },
    originName: providerName(provider),
    via: ['Openverse'],
    landing: r.foreign_landing_url,
    license: r.license,
    licenseVersion: r.license_version,
    preview: { type: 'audio', url: r.url, thumb: r.thumbnail || undefined },
    downloads: [{ label, url: r.url, format: r.filetype || undefined, size: r.filesize || undefined }],
    meta: r.duration ? { dauer: `${Math.round(r.duration / 1000)} s` } : undefined,
  });
}

// ---------------------------------------------------------------------------------------------
// Search lists: which endpoint and filters belong to which config list.

export const LISTS = {
  bilder: { path: '/images/', params: {}, parse: parseImage },
  musik: { path: '/audio/', params: { category: 'music', excluded_source: 'ccmixter' }, parse: (r) => parseAudio(r, 'musik') },
  // Freesound results carry no category in Openverse, so sound effects are selected by source.
  sounds: { path: '/audio/', params: { source: 'freesound' }, parse: (r) => parseAudio(r, 'sound') },
};

/** [{ art, terms }] from the adapter config, in a fixed order. */
export function listsFromConfig(cfg) {
  return Object.keys(LISTS).map((art) => ({ art, terms: [...new Set((cfg[art] ?? []).map((t) => String(t).trim()).filter(Boolean))] }));
}

// ---------------------------------------------------------------------------------------------
// Crawl state (pure functions, tested in tests/adapters-neu-2.test.mjs).
//
// state = {
//   version: 1,
//   zyklus: 1,                       running number of the cycle
//   zyklusStart: "2026-11-23",       day the cycle began (a new one never starts on the same day)
//   begriffe: {
//     "bilder:landscape": { seite: 3, proSeite: 20, seiten?: 12, fertig: false, zuletzt?: ISO, fehler?: text }
//   }
// }
// `seite` is the next page to fetch, `seiten` the page_count the API reported for this window.

export function emptyState(heute) {
  return { version: 1, zyklus: 1, zyklusStart: heute, begriffe: {} };
}

const keyOf = (art, term) => `${art}:${term}`;

/**
 * Plans the next requests.
 * @param state    stored state (not modified)
 * @param lists    [{ art, terms }]
 * @param opts     { budget, pageSize, maxDepth?, restart?, heute }
 *                 restart: allow a new cycle when every term is done (only on the first plan of a run)
 * @returns { state, requests: [{ key, art, term, page }], neuerZyklus }
 */
export function planRequests(state, lists, { budget, pageSize, maxDepth = MAX_DEPTH, restart = true, heute }) {
  const st = structuredClone(state ?? emptyState(heute));
  st.begriffe ??= {};
  const maxPage = Math.max(1, Math.floor(maxDepth / pageSize));
  const active = [];
  for (const { art, terms } of lists) for (const term of terms) active.push({ key: keyOf(art, term), art, term });

  for (const { key } of active) {
    const e = st.begriffe[key];
    if (!e) {
      st.begriffe[key] = { seite: 1, proSeite: pageSize, fertig: false };
      continue;
    }
    // Page size changed (key added or removed): keep the offset, not the page number.
    if (e.proSeite !== pageSize) {
      const offset = (Math.max(1, e.seite) - 1) * (e.proSeite || pageSize);
      e.seite = Math.floor(offset / pageSize) + 1;
      e.proSeite = pageSize;
      delete e.seiten;
    }
    if (!e.fertig && e.seite > Math.min(maxPage, e.seiten ?? maxPage)) e.fertig = true;
  }

  let neuerZyklus = false;
  const allDone = active.length > 0 && active.every(({ key }) => st.begriffe[key].fertig);
  if (allDone && restart && st.zyklusStart !== heute) {
    for (const { key } of active) st.begriffe[key] = { seite: 1, proSeite: pageSize, fertig: false };
    st.zyklus = (st.zyklus ?? 0) + 1;
    st.zyklusStart = heute;
    neuerZyklus = true;
  }

  const open = active
    .map((a, index) => {
      const e = st.begriffe[a.key];
      return { ...a, index, next: e.seite, limit: Math.min(maxPage, e.seiten ?? maxPage), done: e.fertig };
    })
    .filter((a) => !a.done && a.next <= a.limit);

  const requests = [];
  while (requests.length < budget) {
    let best = null;
    for (const a of open) if (a.next <= a.limit && (!best || a.next < best.next)) best = a;
    if (!best) break;
    requests.push({ key: best.key, art: best.art, term: best.term, page: best.next });
    best.next++;
  }
  return { state: st, requests, neuerZyklus };
}

/** Folds one answered request into the state. */
export function applyResult(state, key, { page, pageCount, resultCount }, now = new Date().toISOString()) {
  const st = structuredClone(state);
  const e = st.begriffe[key];
  e.seite = page + 1;
  e.zuletzt = now;
  if (Number.isFinite(pageCount)) e.seiten = pageCount;
  if (!resultCount || !Number.isFinite(pageCount) || page >= pageCount) e.fertig = true;
  delete e.fehler;
  return st;
}

/** Marks a term as done without results, e.g. after the API refused the page depth or the query. */
export function markDone(state, key, reason, now = new Date().toISOString()) {
  const st = structuredClone(state);
  Object.assign(st.begriffe[key], { fertig: true, zuletzt: now, fehler: reason || undefined });
  if (!reason) delete st.begriffe[key].fehler;
  return st;
}

async function loadState(path, heute) {
  try {
    const st = JSON.parse(await readFile(path, 'utf8'));
    if (st && st.version === 1 && st.begriffe) return st;
  } catch {}
  return emptyState(heute);
}

async function saveState(path, st) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(st, null, 1));
  await rename(tmp, path);
}

// ---------------------------------------------------------------------------------------------
// OAuth2 client credentials. The token lives in memory only and is renewed shortly before it expires.

let tokenCache = null;

function credentials(env) {
  const id = env.OPENVERSE_CLIENT_ID?.trim();
  const secret = env.OPENVERSE_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

export async function accessToken(env = process.env, { force = false } = {}) {
  const cred = credentials(env);
  if (!cred) return null;
  if (!force && tokenCache && tokenCache.id === cred.id && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const res = await politeFetch(`${API}/auth_tokens/token/`, {
    method: 'POST',
    // The endpoint only accepts form encoding.
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cred.id, client_secret: cred.secret }).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    timeout: 30000,
    retries: 1,
  });
  // The error never carries the request body, so the secret cannot reach the log.
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`Openverse-Token: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('Openverse-Token: Antwort ohne access_token');
  const life = Number(data.expires_in) > 0 ? Number(data.expires_in) : 3600;
  tokenCache = { id: cred.id, token: data.access_token, expiresAt: Date.now() + Math.max(30, life - 120) * 1000 };
  return tokenCache.token;
}

const statusOf = (err) => Number(String(err?.message ?? '').match(/HTTP (\d{3})/)?.[1]) || 0;
const isDepthError = (err) => /pagination depth/i.test(String(err?.message ?? ''));

source.crawl = async function crawl(cfg, log, env = process.env) {
  const heute = new Date().toISOString().slice(0, 10);
  let token = null;
  if (credentials(env)) {
    try {
      token = await accessToken(env);
    } catch (err) {
      log(`  openverse: Anmeldung fehlgeschlagen (${err.message}), weiter ohne Schlüssel`);
    }
  }
  const authed = Boolean(token);
  setHostGap(HOST, authed ? 700 : 3200);
  const maxSize = authed ? 50 : 20;
  // With a key, 48 per page uses the 240-result window in 5 requests (50 would stop at 200 results).
  const pageSize = Math.min(Number(cfg.proSuche) || (authed ? 48 : 20), maxSize);
  const budget = Math.max(0, Number(cfg.budget) || (authed ? 2000 : 150));
  const statePath = cfg.stand ?? STATE_FILE;
  const lists = listsFromConfig(cfg);
  // The nightly job has 90 minutes for crawl, link check and tests; progress is saved either way.
  const deadline = Date.now() + (Number(cfg.maxMinuten) || 40) * 60000;

  let state = await loadState(statePath, heute);
  const out = [];
  let used = 0;
  let stop = null;

  const search = async (req) => {
    const { path, params } = LISTS[req.art];
    const url = `${API}${path}?${q({ q: req.term, ...params, license: LICENSES, page_size: pageSize, page: req.page, mature: 'false' })}`;
    // Filtered searches take around 20 s, hence the long timeout and a single retry.
    const opts = () => ({ timeout: 75000, retries: 1, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    try {
      return await getJson(url, opts());
    } catch (err) {
      // An expired token also answers 401; renew once. A 401 about depth is a real end of the window.
      if (token && statusOf(err) === 401 && !isDepthError(err)) {
        token = await accessToken(env, { force: true });
        return getJson(url, opts());
      }
      throw err;
    }
  };

  try {
    let first = true;
    while (used < budget && !stop) {
      const plan = planRequests(state, lists, { budget: budget - used, pageSize, restart: first, heute });
      state = plan.state;
      if (plan.neuerZyklus) log(`  openverse: alle Begriffe abgearbeitet, Zyklus ${state.zyklus} beginnt`);
      first = false;
      if (!plan.requests.length) break;
      for (const req of plan.requests) {
        const e = state.begriffe[req.key];
        // A term can run out before its planned pages; the next plan hands the budget to the others.
        if (e.fertig || e.seite !== req.page) break;
        if (Date.now() > deadline) {
          stop = 'Zeitlimit erreicht';
          break;
        }
        used++;
        try {
          const data = await search(req);
          const results = data.results ?? [];
          for (const r of results) {
            const it = LISTS[req.art].parse(r);
            if (it) out.push(it);
          }
          state = applyResult(state, req.key, { page: req.page, pageCount: Number(data.page_count), resultCount: results.length });
        } catch (err) {
          const status = statusOf(err);
          if (isDepthError(err)) {
            state = markDone(state, req.key);
          } else if (status >= 400 && status < 500 && status !== 401 && status !== 429) {
            // The query itself is refused (e.g. invalid term): skip it until the next cycle.
            state = markDone(state, req.key, `HTTP ${status}`);
            log(`  openverse ${req.key} Seite ${req.page}: ${err.message}`);
          } else {
            // 429, 401, 5xx, timeouts: the next requests would fail the same way.
            stop = `${req.key} Seite ${req.page}: ${err.message}`;
            break;
          }
        }
        if (used >= budget) break;
        if (used % 25 === 0) await saveState(statePath, state);
      }
    }
  } finally {
    await saveState(statePath, state);
  }

  const active = lists.flatMap(({ art, terms }) => terms.map((t) => keyOf(art, t)));
  const done = active.filter((k) => state.begriffe[k]?.fertig).length;
  if (stop) log(`  openverse: Lauf abgebrochen (${stop})`);
  log(`  openverse: ${used}/${budget} Anfragen ${authed ? 'mit Schlüssel' : 'anonym'}, ${done}/${active.length} Begriffe im Zyklus ${state.zyklus} fertig`);
  return out;
};

export default source;
