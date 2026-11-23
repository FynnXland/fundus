// Art Institute of Chicago: public-domain artworks, images via IIIF. The API docs ask for at most
// one request per second and the 843-pixel IIIF size, which is what the site uses.
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem } from '../lib/item.mjs';

const API = 'https://api.artic.edu/api/v1/artworks/search';
const IIIF = 'https://www.artic.edu/iiif/2';
const FIELDS = 'id,title,artist_title,artist_display,image_id,is_public_domain,date_display,classification_title,term_titles,thumbnail';

const source = {
  id: 'artic',
  code: 'AI',
  name: 'Art Institute of Chicago',
  url: 'https://www.artic.edu',
  kinds: ['bild'],
  terms: 'https://www.artic.edu/open-access/open-access-images',
};

export function parseArtwork(a) {
  if (!a.is_public_domain || !a.image_id) return null;
  const artist = a.artist_title || (a.artist_display ?? '').split('\n')[0] || 'unbekannt';
  return makeItem(source, {
    sourceId: a.id,
    kind: 'bild',
    title: a.date_display ? `${a.title} (${a.date_display})` : a.title,
    tags: [a.classification_title, ...(a.term_titles ?? []).slice(0, 6)],
    creator: { name: artist },
    landing: `https://www.artic.edu/artworks/${a.id}`,
    license: 'public domain',
    preview: { type: 'image', thumb: `${IIIF}/${a.image_id}/full/400,/0/default.jpg`, url: `${IIIF}/${a.image_id}/full/843,/0/default.jpg` },
    downloads: [{ label: 'JPG, 843 px breit', url: `${IIIF}/${a.image_id}/full/843,/0/default.jpg`, format: 'jpg' }],
    meta: a.thumbnail?.width ? { original: `${a.thumbnail.width} × ${a.thumbnail.height} px` } : undefined,
  });
}

source.crawl = async function crawl(cfg, log) {
  setHostGap('api.artic.edu', 1100);
  const out = [];
  for (const term of cfg.suchen ?? []) {
    const url = `${API}?q=${encodeURIComponent(term)}&query[term][is_public_domain]=true&limit=${cfg.proSuche ?? 20}&fields=${FIELDS}`;
    try {
      const data = await getJson(url, { headers: { 'AIC-User-Agent': 'FundusBot/0.1 (Katalog freier Assets)' } });
      for (const a of data.data ?? []) {
        const it = parseArtwork(a);
        if (it) out.push(it);
      }
    } catch (err) {
      log(`  artic ${term}: ${err.message}`);
    }
  }
  return out;
};

export default source;
