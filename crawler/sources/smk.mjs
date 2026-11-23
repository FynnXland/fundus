// Statens Museum for Kunst (SMK, Denmark) Open API (checked 23.11.2026, api.smk.dk/api/v1/art/search):
// - No key. [public_domain:true],[has_image:true] currently lists 39,548 objects; each object carries `public_domain`
//   and a `rights` URL (all samples: the Public Domain Mark). Only public_domain === true together with a PDM or CC0
//   rights URL passes (objects with public_domain false link to "use of SMK material" and are dropped).
// - SMK states that a large part of its collection is in the public domain and offers free download of those images
//   (smk.dk/en/section/use-of-smk-material/, "Free download of images / Art in the Public Domain"). api.smk.dk has no
//   robots.txt (Express 404), iip-thumb.smk.dk none either.
// - Images: iip-thumb.smk.dk (IIIF, Access-Control-Allow-Origin: *, 200 image/jpeg for bot and browser UA). The server
//   renders each size from a JP2 on first request: cold requests took 21 s (!400,), 84 s (!1024,) and about 1 s when
//   warm, none failed outright. The API's own `image_thumbnail` (!1024,) is used unchanged for thumbnail and large
//   preview, so each object is rendered once. Thumbnail runs need a timeout of at least 120 s and one retry. Downloads
//   (`image_native`) come from api.smk.dk/api/v1/download (21 MB JPEG as attachment, Access-Control-Allow-Origin: *).
// - Work is spread over days: data/crawlstand/smk.json keeps the next offset. `cfg.budget` requests per run.
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';
import { advanceStrand, emptyStrand, loadJson, prepareStrand, saveJson } from './stand-helfer.mjs';

const API = 'https://api.smk.dk/api/v1/art/search/';
const HOST = 'api.smk.dk';
const STATE_FILE = 'data/crawlstand/smk.json';
const FIELDS = 'object_number,frontend_url,titles,artist,production,production_date,techniques,object_names,public_domain,rights,image_thumbnail,image_native,image_iiif_id,image_width,image_height,has_image';

const source = {
  id: 'smk',
  code: 'C3',
  name: 'Statens Museum for Kunst',
  url: 'https://open.smk.dk/',
  kinds: ['bild'],
  terms: 'https://www.smk.dk/en/section/use-of-smk-material/',
};

const RIGHTS = {
  'https://creativecommons.org/publicdomain/mark/1.0/': 'pdm',
  'http://creativecommons.org/publicdomain/mark/1.0/': 'pdm',
  'https://creativecommons.org/publicdomain/zero/1.0/': 'cc0',
  'http://creativecommons.org/publicdomain/zero/1.0/': 'cc0',
};

const THUMB_HOST = 'iip-thumb.smk.dk';

/** One search item → catalogue entry, or null unless it is flagged public_domain with a PDM/CC0 rights URL. */
export function parseArtwork(a) {
  if (!a || a.public_domain !== true) return null;
  const license = RIGHTS[a.rights];
  if (!license || a.has_image === false) return null;
  const no = typeof a.object_number === 'string' ? a.object_number.trim() : '';
  let thumb;
  try {
    const t = new URL(a.image_thumbnail);
    if (t.host !== THUMB_HOST || !/\/full\/![0-9]+,\/0\/default\.jpg$/.test(t.pathname)) return null;
    thumb = t;
  } catch {
    return null;
  }
  const frontend = a.frontend_url;
  if (!no || typeof frontend !== 'string' || !/^https:\/\/open\.smk\.dk\//.test(frontend)) return null;
  const titles = Array.isArray(a.titles) ? a.titles : [];
  const title = (titles.find((t) => /engelsk|english/i.test(t.language ?? '')) ?? titles[0])?.title?.trim();
  if (!title) return null;

  const artists = (Array.isArray(a.artist) ? a.artist : []).filter((n) => typeof n === 'string' && n.trim()).slice(0, 3);
  const downloads = [];
  if (typeof a.image_native === 'string' && /^https:\/\/api\.smk\.dk\/api\/v1\/download\//.test(a.image_native)) {
    downloads.push({ label: 'JPEG in voller Auflösung', url: a.image_native, format: 'jpg' });
  }
  if (!downloads.length) return null;

  const meta = {};
  const period = a.production_date?.[0]?.period;
  if (period) meta.entstanden = String(period);
  if (a.techniques?.[0]) meta.technik = String(a.techniques[0]);
  if (a.image_width && a.image_height) meta.abmessung = `${a.image_width} × ${a.image_height} px`;
  return makeItem(source, {
    sourceId: no,
    kind: 'bild',
    title,
    tags: [...new Set((a.object_names ?? []).map((o) => String(o.name ?? '').toLowerCase()).filter(Boolean))],
    creator: { name: artists.join(', ') || 'unbekannt' },
    landing: frontend,
    license,
    preview: { type: 'image', thumb: thumb.href, url: thumb.href },
    downloads,
    meta: Object.keys(meta).length ? meta : undefined,
  });
}

export function requestUrl(offset, rows) {
  return `${API}?${q({ keys: '*', filters: '[public_domain:true],[has_image:true]', offset, rows, lang: 'en', fields: FIELDS })}`;
}

/** Next offset, or null when this page was the last one. */
export function nextOffset(offset, count, found, rows) {
  if (!count || count < rows) return null;
  const next = offset + count;
  return Number.isFinite(found) && found > 0 && next >= found ? null : next;
}

source.crawl = async function crawl(cfg = {}, log = () => {}) {
  setHostGap(HOST, Number(cfg.abstandMs) || 1500);
  const rows = Math.min(Math.max(Number(cfg.proSeite) || 200, 10), 1000);
  const budget = Math.max(1, Number(cfg.budget) || 25);
  const heute = new Date().toISOString().slice(0, 10);
  const statePath = cfg.stand ?? STATE_FILE;
  const loaded = await loadJson(statePath, { version: 1, strang: emptyStrand() });
  let strand = prepareStrand(loaded.strang, { heute, nachTagen: cfg.wiederholenNachTagen });
  const out = [];
  let used = 0;
  let rejected = 0;
  let stop = null;
  try {
    while (used < budget && !strand.fertig) {
      const offset = Number(strand.weiter) || 0;
      used++;
      let data;
      try {
        data = await getJson(requestUrl(offset, rows), { timeout: 60000 });
      } catch (err) {
        stop = err.message;
        break;
      }
      const list = Array.isArray(data.items) ? data.items : [];
      for (const a of list) {
        const it = parseArtwork(a);
        if (it) out.push(it);
        else rejected++;
      }
      strand = advanceStrand(strand, nextOffset(offset, list.length, Number(data.found), rows), heute);
    }
  } finally {
    await saveJson(statePath, { version: 1, strang: strand });
  }
  if (stop) log(`  smk: Lauf abgebrochen (${stop})`);
  log(`  smk: ${used}/${budget} Anfragen, ${out.length} Werke, ${rejected} verworfen, ${strand.fertig ? 'Zyklus fertig' : `weiter ab ${strand.weiter}`}`);
  return out;
};

export default source;
