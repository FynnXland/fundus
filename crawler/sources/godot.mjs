// Godot Asset Library (godotengine.org/asset-library): add-ons, tools, templates and demo projects for the
// Godot engine. Checked 23.11.2026: the public JSON API that the editor itself uses answers without a key,
// robots.txt has no rules, and no terms were found that restrict automated reading. Every asset carries the
// licence of its code in the field "cost" (the name is historical).
//
// Listing: /api/asset?type=any&max_results=500&page=N, pages count from 0 (11 pages, 5464 assets). The listing
// has the licence, so assets with a licence outside the whitelist are never fetched in detail. Details
// (/api/asset/<id>: download_url, previews, description) are read one per request in stages;
// data/crawlstand/godot.json remembers the modify_date that was read, so a later run only reads new or
// changed assets.
//
// Kinds: detail type "addon" (tools, scripts, shaders, 2D/3D tools, misc) -> skript, "project" (templates,
// demos, projects) -> projekt.
//
// Pictures: authors host them anywhere (imgur, file hosts that block hotlinking). The card only takes a
// picture from hosts known to serve stable files; everything else gets the description as text preview.
// github.com/user-attachments/... is excluded on purpose: it redirects to an S3 URL that expires after 5 min.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';
import { normalizeLicense } from '../lib/licenses.mjs';

const HOST = 'godotengine.org';
const API = `https://${HOST}/asset-library/api`;
const STATE_FILE = 'data/crawlstand/godot.json';

const source = {
  id: 'godot',
  code: 'B2',
  name: 'Godot Asset Library',
  url: `https://${HOST}/asset-library/`,
  kinds: ['skript', 'projekt'],
  terms: `https://${HOST}/asset-library/`,
};

// The library writes GPL variants without the SPDX dash form.
const SPDX = {
  GPLv2: 'GPL-2.0',
  GPLv3: 'GPL-3.0',
  AGPLv3: 'AGPL-3.0',
  LGPLv3: 'LGPL-3.0',
  'LGPLv2.1': 'LGPL-2.1',
};

/** Licence record for the library's "cost" value, or null (Proprietary, LGPLv2, unknown). */
export function licenseOf(cost) {
  const raw = String(cost ?? '').trim();
  if (!raw || /^proprietary$/i.test(raw)) return null;
  return normalizeLicense(SPDX[raw] ?? raw);
}

const KIND = { addon: 'skript', project: 'projekt' };
const ART = { addon: 'Add-on', project: 'Projekt' };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
// Hosts that serve pictures as stable, public files (checked against the real listing, 23.11.2026).
const PICTURE_HOSTS = new Set(['raw.githubusercontent.com', 'user-images.githubusercontent.com', 'media.githubusercontent.com']);

// Path forms that answer with the file itself (curl-checked 23.11.2026). The "blob" pages of GitHub and
// GitLab, and GitLab project avatars, are HTML or need a login, so they are not listed.
const FILE_PATHS = {
  // /raw/ redirects to raw.githubusercontent.com; /blob/ only with ?raw=true; user-attachments expire after 5 min
  'github.com': (u) => /^\/[^/]+\/[^/]+\/raw\//.test(u.pathname) || (/^\/[^/]+\/[^/]+\/blob\//.test(u.pathname) && u.searchParams.get('raw') === 'true'),
  'gitlab.com': (u) => /\/raw\//.test(u.pathname),
  'codeberg.org': (u) => /^\/[^/]+\/[^/]+\/(raw\/(branch|commit|tag)|media\/(branch|commit|tag))\//.test(u.pathname),
};

/** True when the address is a picture file from a host the catalogue trusts. */
export function pictureAllowed(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || !IMAGE_EXT.test(u.pathname)) return false;
  return PICTURE_HOSTS.has(u.host) || Boolean(FILE_PATHS[u.host]?.(u));
}

function previewOf(d) {
  const candidates = [...(d.previews ?? []).filter((p) => p.type === 'image').map((p) => p.link), d.icon_url];
  const url = candidates.find((c) => c && pictureAllowed(c));
  if (url) return { type: 'image', thumb: url, url };
  const text = String(d.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return { type: 'text', text: text || d.title };
}

/** @param d  one answer of /api/asset/<id> */
export function parseAsset(d) {
  const kind = KIND[d?.type];
  const license = licenseOf(d?.cost);
  if (!kind || !license || !d.download_url || !d.title) return null;
  const sha = /^[0-9a-f]{64}$/i.test(d.download_hash ?? '') ? d.download_hash.toLowerCase() : undefined;
  const meta = { art: ART[d.type] };
  if (d.category) meta.kategorie = d.category;
  if (d.godot_version) meta.godot = d.godot_version;
  if (d.version_string) meta.version = d.version_string;
  const host = (() => {
    try {
      return new URL(d.download_url).host;
    } catch {
      return '';
    }
  })();
  return makeItem(source, {
    sourceId: String(d.asset_id),
    kind,
    title: d.title,
    description: d.description,
    tags: ['godot', ...(d.category ? [d.category.toLowerCase()] : []), kind === 'skript' ? 'add-on' : 'projekt'],
    creator: { name: d.author || 'unbekannt' },
    landing: `https://${HOST}/asset-library/asset/${d.asset_id}`,
    license,
    preview: previewOf(d),
    downloads: [{ label: `Quellcode-ZIP${host ? ` (${host})` : ''}`, url: d.download_url, format: 'zip' }],
    meta,
    // Empty in all 44 detail answers read on 23.11.2026, so the algorithm is unverified; only a 64-digit hex value is kept.
    hashes: sha ? { sha256: sha } : undefined,
  });
}

// ---------------------------------------------------------------------------------------------
// Crawl state (pure functions, tested in tests/adapters-2d.test.mjs).
// state = { version: 1, gesehen: { "<asset_id>": "<modify_date>" | "aus:<modify_date>" } }
// "aus" marks a detail that was read and rejected; it is read again only when modify_date changes.

export function emptyState() {
  return { version: 1, gesehen: {} };
}

/**
 * Splits the listing into detail requests for this run and counts what was left out.
 * Unseen assets come first (listing order), then the ones whose modify_date changed.
 */
export function planDetails(state, listing, budget) {
  const seen = state?.gesehen ?? {};
  const fresh = [];
  const changed = [];
  const skipped = { lizenz: 0, lizenzen: {}, bekannt: 0 };
  const dupes = new Set();
  for (const a of listing) {
    const id = String(a.asset_id);
    if (dupes.has(id)) continue;
    dupes.add(id);
    if (!licenseOf(a.cost)) {
      skipped.lizenz++;
      skipped.lizenzen[a.cost] = (skipped.lizenzen[a.cost] ?? 0) + 1;
      continue;
    }
    const was = seen[id];
    if (was === undefined) fresh.push(a);
    else if (was === a.modify_date || was === `aus:${a.modify_date}`) skipped.bekannt++;
    else changed.push(a);
  }
  return { todo: [...fresh, ...changed].slice(0, Math.max(0, budget)), skipped, offen: fresh.length + changed.length };
}

async function loadState(path) {
  try {
    const st = JSON.parse(await readFile(path, 'utf8'));
    if (st?.version === 1 && st.gesehen) return st;
  } catch {}
  return emptyState();
}

async function saveState(path, st) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(st));
  await rename(`${path}.tmp`, path);
}

const statusOf = (err) => Number(String(err?.message ?? '').match(/HTTP (\d{3})/)?.[1]) || 0;

source.crawl = async function crawl(cfg, log) {
  // One request per second; the library is a community service.
  setHostGap(HOST, Number(cfg.abstandMs) || 1000);
  const statePath = cfg.stand ?? STATE_FILE;
  const budget = Math.max(0, Number(cfg.budget) || 400);
  const deadline = Date.now() + (Number(cfg.maxMinuten) || 30) * 60000;

  const listing = [];
  let pages = 1;
  for (let page = 0; page < pages; page++) {
    try {
      const data = await getJson(`${API}/asset?${q({ godot_version: 'any', type: 'any', max_results: 500, page })}`, { timeout: 60000 });
      listing.push(...(data.result ?? []));
      pages = Math.min(Number(data.pages) || 1, 40);
    } catch (err) {
      log(`  godot Liste Seite ${page}: ${err.message}`);
      break;
    }
  }
  if (!listing.length) return [];

  const state = await loadState(statePath);
  const plan = planDetails(state, listing, budget);
  const out = [];
  let read = 0;
  let stop = null;
  try {
    for (const a of plan.todo) {
      if (Date.now() > deadline) {
        stop = 'Zeitlimit erreicht';
        break;
      }
      const id = String(a.asset_id);
      read++;
      try {
        const item = parseAsset(await getJson(`${API}/asset/${id}`, { timeout: 45000 }));
        if (item) {
          out.push(item);
          state.gesehen[id] = a.modify_date;
        } else state.gesehen[id] = `aus:${a.modify_date}`;
      } catch (err) {
        const status = statusOf(err);
        if (status === 404) state.gesehen[id] = `aus:${a.modify_date}`;
        else if (status === 403 || status === 429) {
          stop = `HTTP ${status} bei Asset ${id}`;
          break;
        } else log(`  godot ${id}: ${err.message}`);
      }
      if (read % 50 === 0) await saveState(statePath, state);
    }
  } finally {
    await saveState(statePath, state);
  }
  const ausgelassen = Object.entries(plan.skipped.lizenzen).map(([k, n]) => `${k} ${n}`).join(', ');
  if (stop) log(`  godot: Lauf abgebrochen (${stop})`);
  log(`  godot: ${listing.length} in der Liste, ${read} Details gelesen, ${out.length} übernommen, ${Math.max(0, plan.offen - read)} noch offen, Lizenz nicht zugelassen: ${plan.skipped.lizenz}${ausgelassen ? ` (${ausgelassen})` : ''}`);
  return out;
};

export default source;
