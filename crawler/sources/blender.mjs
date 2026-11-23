// Blender Extensions (extensions.blender.org): add-ons and themes, listed by the public API v1 that Blender
// itself reads as its remote repository. One request returns the whole listing (1702 rows, 1542 extensions,
// checked 23.11.2026). robots.txt allows everything for "*" (content signal search=yes); the terms of service
// only bind uploaders (add-ons GPL-3.0-or-later compatible, bundled assets CC0).
// Platform builds of one extension come as separate rows with the same id; they become one entry with one
// download per platform. "asset-library" rows are only pointers to other libraries and are skipped.
// The API carries no pictures, so the card shows the tagline (no HTML pages are fetched for images).
// Ratings: the API has none, but the public listing pages (/add-ons/?page=N, /themes/?page=N, 16 cards each, about
// 100 requests) show stars, number of votes and downloads on every card. Those pages are read once per crawl, in
// name order so pages do not shift while paging; one extension = one card = one rating from the site itself.
import { getJson, politeFetch, setHostGap } from '../lib/http.mjs';
import { bewertung, beliebtheit } from '../lib/bewertung.mjs';
import { makeItem } from '../lib/item.mjs';
import { normalizeLicense } from '../lib/licenses.mjs';

const API = 'https://extensions.blender.org/api/v1/extensions/';

const source = {
  id: 'blender',
  code: 'B1',
  name: 'Blender Extensions',
  url: 'https://extensions.blender.org',
  kinds: ['skript'],
  terms: 'https://extensions.blender.org/terms-of-service/',
};

const TYPES = { 'add-on': 'Add-on', theme: 'Theme' };

/** Every licence of the extension must pass the whitelist; the first one is shown. */
export function licenseOf(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const recs = list.map((l) => normalizeLicense(String(l).replace(/^SPDX:/i, '')));
  return recs.every(Boolean) ? recs[0] : null;
}

/** @param rows  all API rows with the same extension id */
export function parseExtension(rows, blocked = new Set()) {
  const r = rows?.[0];
  if (!r || !TYPES[r.type] || blocked.has(r.id)) return null;
  const license = licenseOf(r.license);
  if (!license || rows.some((x) => !licenseOf(x.license))) return null;
  const downloads = rows
    .filter((x) => x.archive_url)
    .map((x) => ({
      label: x.platforms?.length ? `ZIP (${x.platforms.join(', ')})` : 'Erweiterung (ZIP)',
      url: x.archive_url,
      format: 'zip',
      size: x.archive_size || undefined,
    }));
  const sha = r.archive_hash?.match(/^sha256:([0-9a-f]{64})$/)?.[1];
  const meta = { art: TYPES[r.type], version: r.version };
  if (r.blender_version_min) meta.blender = `ab ${r.blender_version_min}`;
  return makeItem(source, {
    sourceId: r.id,
    kind: 'skript',
    title: r.name,
    description: r.tagline,
    tags: ['blender', TYPES[r.type].toLowerCase(), ...(r.tags ?? [])],
    creator: { name: r.maintainer || 'unbekannt' },
    landing: r.website,
    license,
    preview: { type: 'text', text: r.tagline ?? '' },
    downloads,
    meta,
    // sha256 of the archive as published by the platform
    hashes: sha ? { sha256: sha } : undefined,
  });
}

/**
 * Cards of one listing page: slug -> { stars (one decimal, as the site shows it), votes, downloads }.
 * A card without reviews has no stars, only the download count.
 */
export function parseCards(html) {
  const out = new Map();
  for (const card of String(html ?? '').split('<div class="cards-item">').slice(1)) {
    const slug = card.match(/<h3 class="cards-item-title">\s*<a href="\/(?:add-ons|themes)\/([a-z0-9_-]+)\/"/i)?.[1];
    if (!slug) continue;
    const stars = card.match(/title="Rated ([0-9.]+) out of 5"[\s\S]*?\((\d+)\)/);
    const downloads = card.match(/title="(\d+) downloads"/);
    out.set(slug, { stars: stars ? Number(stars[1]) : null, votes: stars ? Number(stars[2]) : 0, downloads: downloads ? Number(downloads[1]) : 0 });
  }
  return out;
}

const slugOf = (it) => it.source.url.match(/\/(?:add-ons|themes)\/([a-z0-9_-]+)\/?$/i)?.[1];

/** Adds rating and popularity from the listing cards to the entries (matched by the slug in the landing page). */
export function mitKarten(items, cards) {
  return items.map((it) => {
    const c = cards.get(slugOf(it));
    if (!c) return it;
    const rating = c.stars === null ? undefined : bewertung({ value: c.stars, min: 0, max: 5, count: c.votes, name: source.name, url: `${it.source.url.replace(/\/?$/, '/')}reviews/` });
    const popularity = beliebtheit({ value: c.downloads, label: 'Downloads', name: source.name, url: it.source.url });
    return { ...it, ...(rating ? { rating } : {}), ...(popularity ? { popularity } : {}) };
  });
}

/** Groups the API listing by extension id and parses every group. */
export function parseListing(data) {
  const blocked = new Set((data?.blocklist ?? []).map((b) => (typeof b === 'string' ? b : b?.id)).filter(Boolean));
  const groups = new Map();
  for (const r of data?.data ?? []) {
    if (!groups.has(r.id)) groups.set(r.id, []);
    groups.get(r.id).push(r);
  }
  return [...groups.values()].map((rows) => parseExtension(rows, blocked)).filter(Boolean);
}

source.crawl = async function crawl(cfg, log) {
  setHostGap('extensions.blender.org', 2000);
  try {
    let items = parseListing(await getJson(API, { timeout: 60000 }));
    if (cfg.limit) items = items.slice(0, cfg.limit);
    if (cfg.bewertungen !== false) {
      const cards = new Map();
      for (const art of ['add-ons', 'themes']) {
        for (let page = 1; page <= (cfg.maxSeiten ?? 150); page++) {
          const res = await politeFetch(`https://extensions.blender.org/${art}/?page=${page}&sort_by=name`, { retries: 1 });
          if (!res.ok) {
            await res.body?.cancel().catch(() => {});
            if (res.status !== 404) log(`  blender ${art} Seite ${page}: HTTP ${res.status}`);
            break;
          }
          const found = parseCards(await res.text());
          if (!found.size) break;
          for (const [k, v] of found) cards.set(k, v);
        }
      }
      items = mitKarten(items, cards);
      log(`  blender: ${cards.size} Karten gelesen, ${items.filter((it) => it.rating).length} mit Bewertung`);
    }
    return items;
  } catch (err) {
    log(`  blender: ${err.message}`);
    return [];
  }
};

export default source;
