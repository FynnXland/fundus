// Iconify: open-source icon sets, one entry per set (not per icon). The set list comes from the public
// API (api.iconify.design/collections, one request); the licence is the set's SPDX id and must pass the
// whitelist. Preview SVGs are rendered by the public API, which sends CORS and cross-origin CORP headers.
// The API docs say its main purpose is serving icon components and other use "should not be abused",
// so the crawler makes one request by default. More than the (up to six) samples per set costs one
// /collection request per set and is opt-in (cfg.mehrBeispiele).
// Download: the complete set as IconifyJSON from the iconify/icon-sets repository on GitHub.
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';

const API = 'https://api.iconify.design';
const MAX_ICONS = 12;

const source = {
  id: 'iconify',
  code: 'IC',
  name: 'Iconify',
  url: 'https://iconify.design',
  kinds: ['icon'],
  terms: 'https://iconify.design/docs/api/#limits',
};

const svgUrl = (prefix, icon) => `${API}/${prefix}/${icon}.svg`;

/**
 * @param {string} prefix  icon set prefix, e.g. "mdi"
 * @param {object} info    entry of /collections
 * @param {string[]} [extra]  more icon names (from /collection), appended after the samples
 */
export function parseCollection(prefix, info, extra = []) {
  if (!info || info.hidden || info.deprecated || !/^[a-z0-9-]+$/.test(prefix)) return null;
  const icons = [...new Set([...(info.samples ?? []), ...extra])].filter((n) => /^[a-z0-9-]+$/.test(n)).slice(0, MAX_ICONS);
  if (!icons.length) return null;
  const meta = {};
  if (info.total) meta.icons = String(info.total);
  if (info.category) meta.kategorie = info.category;
  if (info.version) meta.version = info.version;
  if (info.height) meta.raster = `${Array.isArray(info.height) ? info.height.join(', ') : info.height} px`;
  return makeItem(source, {
    sourceId: prefix,
    kind: 'icon',
    title: info.name || prefix,
    tags: [info.category, ...(info.tags ?? []), info.palette ? 'mehrfarbig' : 'einfarbig'].filter(Boolean),
    creator: { name: info.author?.name || 'unbekannt', url: info.author?.url || undefined },
    landing: `https://icon-sets.iconify.design/${prefix}/`,
    license: info.license?.spdx,
    collection: { id: prefix, name: info.name || prefix, url: `https://icon-sets.iconify.design/${prefix}/` },
    preview: { type: 'image', thumb: svgUrl(prefix, icons[0]), icons: icons.map((n) => svgUrl(prefix, n)) },
    downloads: [{ label: 'Komplettes Set (IconifyJSON)', url: `https://raw.githubusercontent.com/iconify/icon-sets/master/json/${prefix}.json`, format: 'json' }],
    meta,
  });
}

/** Icon names from a /collection response, in the order the set lists them. */
export function iconNames(data) {
  const names = [...(data.uncategorized ?? []), ...Object.values(data.categories ?? {}).flat()];
  const hidden = new Set(data.hidden ?? []);
  return names.filter((n) => !hidden.has(n));
}

source.crawl = async function crawl(cfg, log) {
  setHostGap('api.iconify.design', 1000);
  const limit = cfg.limit ?? Infinity;
  let sets;
  try {
    sets = await getJson(`${API}/collections`);
  } catch (err) {
    log(`  iconify: ${err.message}`);
    return [];
  }
  // The API lists the sets grouped by category with the well-known ones first; that order is kept.
  const entries = Object.entries(sets).filter(([prefix]) => !(cfg.auslassen ?? []).includes(prefix));
  const out = [];
  for (const [prefix, info] of entries) {
    if (out.length >= limit) break;
    let it = parseCollection(prefix, info);
    if (!it) continue;
    if (cfg.mehrBeispiele && (info.samples?.length ?? 0) < MAX_ICONS) {
      try {
        const data = await getJson(`${API}/collection?${q({ prefix })}`);
        it = parseCollection(prefix, info, iconNames(data)) ?? it;
      } catch (err) {
        log(`  iconify ${prefix}: ${err.message}`);
      }
    }
    out.push(it);
  }
  return out;
};

export default source;
