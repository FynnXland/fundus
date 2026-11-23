// ambientCG: CC0 materials and HDRIs. A one-person project, so the crawler asks for one page per type
// and caches nothing else. Downloads are ZIP files at the source.
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';

const API = 'https://ambientcg.com/api/v2/full_json';

const source = {
  id: 'ambientcg',
  code: 'AC',
  name: 'ambientCG',
  url: 'https://ambientcg.com',
  kinds: ['textur', 'hdri', '3d'],
  terms: 'https://docs.ambientcg.com/license/',
};

// What each ambientCG data type becomes in the catalogue. Types not listed here (Substance, Brush) are skipped.
const ARTEN = {
  Material: ['textur', 'Material'],
  Decal: ['textur', 'Decal'],
  Atlas: ['textur', 'Atlas'],
  PlainTexture: ['textur', 'Textur'],
  Terrain: ['textur', 'Gelände'],
  HDRI: ['hdri', 'HDRI'],
  HDRIElement: ['hdri', 'HDRI-Element'],
  '3DModel': ['3d', '3D-Modell'],
};
const REIHENFOLGE = ['1K-JPG', '2K-JPG', '4K-JPG', '1K', '2K', '4K', '1K-PNG', '2K-PNG', 'LQ', 'SQ', 'HQ'];

export function parseAsset(a) {
  const art = ARTEN[a.dataType];
  if (!art) return null;
  const zips = a.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads ?? [];
  // preferred sizes first; assets with other variant names keep their first four
  let auswahl = REIHENFOLGE.map((attr) => zips.find((z) => z.attribute === attr)).filter(Boolean).slice(0, 5);
  if (!auswahl.length) auswahl = zips.slice(0, 4);
  const downloads = auswahl.map((z) => ({ label: `${String(z.attribute).replace('-', ' ')} (ZIP)`, url: z.downloadLink, format: 'zip', size: z.size }));
  const img = a.previewImage ?? {};
  const thumb = img['512-PNG'] || img['256-PNG'] || img['512-JPG-242424'] || Object.values(img)[0];
  return makeItem(source, {
    sourceId: a.assetId,
    kind: art[0],
    title: a.displayName || a.assetId,
    tags: [a.displayCategory, ...(a.tags ?? [])].filter((t) => t && !/^\d+$/.test(t)),
    creator: { name: 'ambientCG' },
    landing: a.shortLink || `https://ambientcg.com/view?id=${a.assetId}`,
    license: 'CC0',
    preview: { type: 'image', thumb, url: img['1024-PNG'] || thumb },
    downloads,
    meta: { art: art[1], kategorie: a.displayCategory },
  });
}

// The API ignores unknown values of its type filter and then returns everything, so the crawler pages
// through the whole list (250 per request) and sorts by data type itself.
source.crawl = async function crawl(cfg, log) {
  setHostGap('ambientcg.com', 1500);
  const out = [];
  const typen = new Set(cfg.typen ?? Object.keys(ARTEN));
  const seite = 250;
  for (let offset = 0; out.length < (cfg.limit ?? 10000); offset += seite) {
    let gefunden;
    try {
      const data = await getJson(`${API}?${q({ sort: 'Popular', limit: seite, offset, include: 'downloadData,imageData,tagData,displayData' })}`, { timeout: 60000 });
      gefunden = data.foundAssets ?? [];
    } catch (err) {
      log(`  ambientcg ab ${offset}: ${err.message}`);
      break;
    }
    for (const a of gefunden) {
      if (!typen.has(a.dataType)) continue;
      const it = parseAsset(a);
      if (it) out.push(it);
    }
    if (gefunden.length < seite) break;
  }
  return out;
};

export default source;
