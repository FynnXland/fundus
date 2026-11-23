// Smithsonian Open Access through api.si.edu (checked 23.11.2026 against edan.si.edu/openaccess/apidocs
// and live answers):
// - Key from api.data.gov (env SMITHSONIAN_API_KEY), sent as X-Api-Key header so it stays out of URLs and logs.
//   Default limit of a registered key: 1000 requests per hour.
// - Only records whose metadata and media both say `usage.access === "CC0"`. Images come from ids.si.edu
//   (Access-Control-Allow-Origin: *, no referer check; the high resolution JPEG redirects to the
//   smithsonian-open-access bucket on S3). 3D models come from 3d-api.si.edu with direct file links.
// - Landing pages on www.si.edu, collections.si.edu and 3d.si.edu sit behind a Cloudflare challenge
//   for automated clients, so the link checker could not confirm them. The adapter uses the museum page
//   (`record_link`), for 3D the Voyager viewer page, and skips records that have neither.
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';

const API = 'https://api.si.edu/openaccess/api/v1.0/search';
const HOST = 'api.si.edu';

// Hosts that answer automated requests with a challenge (or redirect there): no usable landing page.
const BLOCKED_LANDING = /^(www\.si\.edu|collections\.si\.edu|3d\.si\.edu|collection\.cooperhewitt\.org)$/i;

const source = {
  id: 'smithsonian',
  code: 'SI',
  name: 'Smithsonian Open Access',
  url: 'https://www.si.edu/openaccess',
  kinds: ['bild', '3d'],
  terms: 'https://www.si.edu/termsofuse',
};

const CC0 = (u) => u?.access === 'CC0';

function landingOf(dn, fallback) {
  for (const u of [dn.record_link, fallback]) {
    if (!u) continue;
    try {
      const p = new URL(u);
      if ((p.protocol === 'https:' || p.protocol === 'http:') && !BLOCKED_LANDING.test(p.host)) return p.href;
    } catch {}
  }
  return null;
}

function creatorOf(row, dn) {
  const name = row.content?.freetext?.name?.[0]?.content;
  return { name: name || dn.data_source || 'Smithsonian Institution' };
}

function tagsOf(row) {
  const s = row.content?.indexedStructured ?? {};
  return [...(s.topic ?? []), ...(s.object_type ?? [])].filter((t) => typeof t === 'string');
}

function withMax(url, max) {
  try {
    const u = new URL(url);
    u.searchParams.set('max', String(max));
    return u.href;
  } catch {
    return undefined;
  }
}

const IMAGE_LABELS = {
  'High-resolution JPEG': 'JPEG in hoher Auflösung',
  'High-resolution TIFF': 'TIFF in hoher Auflösung',
  'Screen Image': 'JPEG in Bildschirmgröße',
};

function imageItem(row, dn, m) {
  const landing = landingOf(dn);
  if (!landing) return null;
  const resources = m.resources ?? [];
  const downloads = Object.keys(IMAGE_LABELS)
    .map((label) => resources.find((r) => r.label === label))
    .filter((r) => r?.url)
    .map((r) => ({ label: IMAGE_LABELS[r.label], url: r.url, format: /TIFF/.test(r.label) ? 'tif' : 'jpg' }));
  if (!downloads.length && m.content) downloads.push({ label: 'Bild (JPEG)', url: m.content, format: 'jpg' });
  const big = resources.find((r) => r.label === 'High-resolution JPEG' && r.width && r.height);
  const w = big?.width ?? m.width;
  const h = big?.height ?? m.height;
  return makeItem(source, {
    sourceId: dn.record_ID || row.id,
    kind: 'bild',
    title: row.title || dn.title?.content || 'Ohne Titel',
    tags: tagsOf(row),
    creator: creatorOf(row, dn),
    originName: dn.data_source ? `Smithsonian, ${dn.data_source}` : undefined,
    landing,
    license: 'cc0',
    preview: { type: 'image', thumb: withMax(m.thumbnail || m.content, 480), url: withMax(m.content, 1600) },
    downloads,
    meta: w && h ? { abmessung: `${w} × ${h} px` } : undefined,
  });
}

const CATEGORY = {
  'low resolution': 'niedrige Auflösung',
  'full resolution': 'volle Auflösung',
  watertight: 'druckfertig',
  'ios ar model': 'AR-Modell für iOS',
};
const FORMAT_ORDER = ['glb', 'gltf', 'obj', 'stl', 'usdz'];
const MAX_PREVIEW_BYTES = 15e6;

function meshInfo(r) {
  const attrs = Object.assign({}, ...(r.attributes ?? []));
  const model = String(attrs.MODEL_FILE_TYPE ?? attrs.FILE_TYPE ?? '').toLowerCase();
  const fileType = String(attrs.FILE_TYPE ?? '').toLowerCase();
  // The DRACO_COMPRESSED flag is not reliable (a *_draco.glb reports false), so the name decides too.
  const draco = Boolean(attrs.DRACO_COMPRESSED) || /draco/i.test(`${model} ${r.filename ?? ''}`);
  const format = model.replace(/draco compress(ed|ion)\s*/, '').trim() || fileType;
  return { model, fileType, draco, format, size: Number(attrs.FILE_SIZE) || undefined };
}

function modelItem(row, dn, m) {
  const landing = landingOf(dn, /^https:\/\/3d-api\.si\.edu\/voyager\//.test(m.content ?? '') ? m.content : undefined);
  if (!landing) return null;
  const meshes = (m.resources ?? []).filter((r) => r.url && /3d mesh/i.test(r.type ?? '')).map((r) => ({ r, ...meshInfo(r) }));
  const rank = (x) => {
    const i = FORMAT_ORDER.indexOf(x.format);
    return (i < 0 ? 9 : i) * 10 + (x.draco ? 1 : 0);
  };
  meshes.sort((a, b) => rank(a) - rank(b) || (a.size ?? Infinity) - (b.size ?? Infinity));
  const downloads = meshes.slice(0, 6).map((x) => {
    const cat = CATEGORY[String(x.r.category ?? '').toLowerCase()] ?? x.r.category;
    const zip = x.fileType === 'zip';
    const label = `${x.format.toUpperCase()}${x.draco ? ' (Draco)' : ''}${zip ? ' als ZIP' : ''}${cat ? `, ${cat}` : ''}`;
    return { label, url: x.r.url, format: zip ? 'zip' : x.format, size: x.size };
  });
  if (!downloads.length) return null;
  // The site's viewer has no Draco decoder; a plain glb of moderate size can be shown in 3D.
  const glb = meshes.filter((x) => x.fileType === 'glb' && !x.draco && x.size && x.size <= MAX_PREVIEW_BYTES).sort((a, b) => a.size - b.size)[0];
  const preview = glb ? { type: 'model', url: glb.r.url, thumb: m.thumbnail || undefined } : { type: 'image', thumb: m.thumbnail, url: m.thumbnail };
  if (preview.type === 'image' && !m.thumbnail) return null;
  return makeItem(source, {
    sourceId: dn.record_ID || row.id,
    kind: '3d',
    title: row.title || dn.title?.content || 'Ohne Titel',
    tags: tagsOf(row),
    creator: creatorOf(row, dn),
    originName: dn.data_source ? `Smithsonian, ${dn.data_source}` : undefined,
    landing,
    license: 'cc0',
    preview,
    downloads,
  });
}

/** One search row → catalogue entry, or null unless metadata and media are CC0. */
export function parseRecord(row) {
  const dn = row?.content?.descriptiveNonRepeating;
  if (!dn || !CC0(dn.metadata_usage)) return null;
  const media = (dn.online_media?.media ?? []).filter((m) => CC0(m.usage));
  const model = media.find((m) => m.type === '3d_voyager');
  if (model) return modelItem(row, dn, model);
  const image = media.find((m) => m.type === 'Images');
  return image ? imageItem(row, dn, image) : null;
}

const IMAGES = 'online_media_type:"Images" AND media_usage:"CC0"';
const MODELS = 'online_media_type:"3D Models" AND media_usage:"CC0"';

source.crawl = async function crawl(cfg, log, env = process.env) {
  const key = env.SMITHSONIAN_API_KEY?.trim();
  if (!key) {
    log('  smithsonian: SMITHSONIAN_API_KEY fehlt, Quelle übersprungen (Schlüssel: https://api.data.gov/signup/)');
    return [];
  }
  setHostGap(HOST, Number(cfg.abstandMs) || 4000); // a registered key allows 1000 per hour
  const rows = Math.min(Number(cfg.proSuche) || 100, 100);
  const budget = Number(cfg.budget) || 60;
  const out = [];
  let used = 0;
  const run = async (query, start) => {
    used++;
    const url = `${API}?${q({ q: query, rows, start })}`;
    const data = await getJson(url, { headers: { 'X-Api-Key': key }, timeout: 45000 });
    const list = data.response?.rows ?? [];
    for (const row of list) {
      const it = parseRecord(row);
      if (it) out.push(it);
    }
    return { count: list.length, total: Number(data.response?.rowCount) || 0 };
  };
  const jobs = [
    ...(cfg.bilder ?? []).flatMap((term) => Array.from({ length: Math.max(1, Number(cfg.seiten) || 1) }, (_, i) => ({ query: `${term} AND ${IMAGES}`, start: i * rows, term }))),
    ...Array.from({ length: Math.ceil((Number(cfg.modelle) || 0) / rows) }, (_, i) => ({ query: MODELS, start: i * rows, term: '3D' })),
  ];
  const exhausted = new Set();
  for (const job of jobs) {
    if (used >= budget) break;
    if (exhausted.has(job.term)) continue;
    try {
      const { count, total } = await run(job.query, job.start);
      if (!count || job.start + count >= total) exhausted.add(job.term);
    } catch (err) {
      log(`  smithsonian ${job.term} ab ${job.start}: ${err.message}`);
      if (/HTTP (401|403|429)/.test(err.message)) break;
    }
  }
  log(`  smithsonian: ${used} Anfragen`);
  return out;
};

export default source;
