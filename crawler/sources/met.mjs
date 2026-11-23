// The Metropolitan Museum of Art, Open Access: images of public-domain works under CC0 (the Met's
// terms and the Open Access page say so explicitly). /v1/search was retired on 1.10.2026 (410), so
// the IDs come from the paginated /v1.1/search and every object is read from /v1/objects/{id}.
// The search filter isPublicDomain is not reliable (non-PD objects come back), so the parser checks it again.
// The API docs ask for at most 80 requests per second; the crawler stays far below that because the
// Met's hosts sit behind Imperva bot protection.
// Blocked for bots (checked 23.11.2026): images.metmuseum.org answers our User-Agent with an Incapsula
// challenge page (HTTP 200, text/html) instead of the JPEG, and after a few requests a browser
// User-Agent as well. Browsers loading the image as <img> still get it. Under CLAUDE.md this counts as
// a block, so the adapter is not listed in sources/index.mjs. The link checker would count the
// challenge page as "ok" and could not notice dead images of this source.
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';

const API = 'https://collectionapi.metmuseum.org/public/collection';

const source = {
  id: 'met',
  code: 'MT',
  name: 'The Metropolitan Museum of Art',
  url: 'https://www.metmuseum.org',
  kinds: ['bild'],
  terms: 'https://www.metmuseum.org/information/terms-and-conditions',
};

export function parseObject(o) {
  if (!o || o.isPublicDomain !== true || !o.primaryImage || !o.primaryImageSmall) return null;
  const title = o.title || o.objectName;
  if (!title) return null;
  const meta = {};
  if (o.objectName) meta.objekt = o.objectName;
  if (o.objectDate) meta.datierung = o.objectDate;
  if (o.department) meta.abteilung = o.department;
  if (o.dimensions) meta.masse = o.dimensions.replace(/\s+/g, ' ').trim();
  return makeItem(source, {
    sourceId: o.objectID,
    kind: 'bild',
    title: o.objectDate ? `${title} (${o.objectDate})` : title,
    tags: [o.classification, o.objectName, o.culture, ...(o.tags ?? []).map((t) => t.term)].filter(Boolean),
    creator: { name: o.artistDisplayName || 'unbekannt', url: o.artistDisplayName ? o.artistWikidata_URL || o.artistULAN_URL || undefined : undefined },
    landing: o.objectURL || `https://www.metmuseum.org/art/collection/search/${o.objectID}`,
    license: 'CC0',
    // primaryImageSmall is the "web-large" rendition (about 600 px); the original can be tens of megabytes.
    preview: { type: 'image', thumb: o.primaryImageSmall, url: o.primaryImageSmall },
    downloads: [{ label: 'Originalbild (JPG)', url: o.primaryImage, format: 'jpg' }],
    meta: Object.keys(meta).length ? meta : undefined,
  });
}

source.crawl = async function crawl(cfg, log) {
  setHostGap('collectionapi.metmuseum.org', 300);
  const suchen = cfg.suchen ?? ['landscape', 'flowers', 'still life', 'japanese woodblock print', 'botanical', 'map'];
  const proSuche = cfg.proSuche ?? 20;
  const limit = cfg.limit ?? Infinity;
  const out = [];
  const seen = new Set();
  for (const term of suchen) {
    if (out.length >= limit) break;
    let ids;
    try {
      // Many hits have no free image (restricted or missing), so ask for more IDs than entries wanted.
      const data = await getJson(`${API}/v1.1/search?${q({ hasImages: 'true', isPublicDomain: 'true', q: term, limit: Math.min(proSuche * 3, 500) })}`);
      ids = data.objectIDs ?? [];
    } catch (err) {
      log(`  met ${term}: ${err.message}`);
      continue;
    }
    let found = 0;
    for (const id of ids) {
      if (found >= proSuche || out.length >= limit) break;
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        const it = parseObject(await getJson(`${API}/v1/objects/${id}`));
        if (it) {
          out.push(it);
          found++;
        }
      } catch (err) {
        log(`  met ${id}: ${err.message}`);
      }
    }
  }
  return out;
};

export default source;
