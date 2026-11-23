// Gazebo Fuel (Open Robotics): simulation models, many of them vehicles (cars, trucks, boats, drones, rovers).
//
// Checked 23.11.2026:
// - fuel.gazebosim.org/1.0/models is the public REST API that the official Fuel client uses. No key, no login.
//   Listing: ?per_page=100&page=N&order=asc, total in the X-Total-Count header (3.472 models that day).
//   order=asc (oldest first) keeps the pages stable while new models arrive.
// - Licence per model as a field (license_name, license_url). Seen: CC BY 4.0 (2.805), CC0 (620), CC BY-SA 4.0 (12),
//   NC and ND variants (35). Only CC0, CC BY and CC BY-SA pass `normalizeLicense`; the rest is dropped.
//   The uploader names the licence, not Open Robotics (gazebosim.org/docs/all/fuel_copyright: Open Robotics cannot
//   determine copyright ownership and removes content on a valid notice). The adapter credits the uploader.
// - app.gazebosim.org/robots.txt allows everything (`User-agent: *`, no Disallow), fuel.gazebosim.org has none (404).
//   No terms of use page exists on either host (app.gazebosim.org/terms is 404).
// - Files: thumbnail and the whole model as ZIP come from the API host (Access-Control-Allow-Origin: *, no referer
//   check, range requests work, HEAD answers 405 so link checks must use GET).
// - Fuel holds forks: the same model re-uploaded under another owner (five "Static_Car"). The first upload wins
//   (listing runs oldest first); a clone is a model with the same name and the same size.
// - The model files are SDF plus OBJ, DAE or STL meshes, which the site's viewer (GLTFLoader only) cannot show,
//   so the preview is the model's own rendered thumbnail.
import { politeFetch, setHostGap } from '../lib/http.mjs';
import { beliebtheit } from '../lib/bewertung.mjs';
import { makeItem, q } from '../lib/item.mjs';
import { normalizeLicense } from '../lib/licenses.mjs';
import { advanceStrand, emptyStrand, loadJson, prepareStrand, saveJson } from './stand-helfer.mjs';

const HOST = 'fuel.gazebosim.org';
const API = `https://${HOST}/1.0`;
const APP = 'https://app.gazebosim.org';
const STATE_FILE = 'data/crawlstand/fuel.json';

const source = {
  id: 'fuel',
  code: 'D1',
  name: 'Gazebo Fuel',
  url: APP,
  kinds: ['3d'],
  terms: 'https://gazebosim.org/docs/all/fuel_copyright/',
};

const seg = (s) => encodeURIComponent(s);

/** Listing URL for one page. */
export function requestUrl(page, perPage) {
  return `${API}/models?${q({ per_page: perPage, page, order: 'asc' })}`;
}

/** Next page number, or null when this page was the last one. */
export function nextPage(page, count, total, perPage) {
  if (!count || count < perPage) return null;
  return Number.isFinite(total) && total > 0 && page * perPage >= total ? null : page + 1;
}

/** Same name and same size = a fork of one model under another owner. */
export const cloneKey = (row) => `${String(row.name ?? '').toLowerCase()}|${row.filesize ?? ''}`;

const tidyName = (name) => String(name).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

/** One listing row → catalogue entry, or null (private, no thumbnail, licence outside the whitelist). */
export function parseModel(row) {
  if (!row?.name || !row.owner || row.private) return null;
  const license = normalizeLicense(row.license_url) ?? normalizeLicense(row.license_name);
  if (!license) return null;
  if (!row.thumbnail_url) return null;
  const base = `${API}/${seg(row.owner)}/models/${seg(row.name)}`;
  const thumb = `${API}${row.thumbnail_url.split('/').map((p) => (p ? seg(unescape(p)) : p)).join('/')}`;
  const cats = (row.categories ?? []).filter((c) => typeof c === 'string');
  const tags = [...cats, ...(row.tags ?? []).filter((t) => typeof t === 'string'), 'gazebo', 'sdf'];
  const description = typeof row.description === 'string' ? row.description.trim() : '';
  const meta = {};
  if (row.downloads) meta.abrufe = String(row.downloads);
  return makeItem(source, {
    sourceId: `${row.owner}/${row.name}`,
    kind: '3d',
    title: tidyName(row.name),
    description: description && description.toLowerCase() !== tidyName(row.name).toLowerCase() ? description : undefined,
    tags,
    creator: { name: row.owner, url: `${APP}/${seg(row.owner)}` },
    landing: `${APP}/${seg(row.owner)}/fuel/models/${seg(row.name)}`,
    license,
    preview: { type: 'image', thumb, url: thumb },
    downloads: [{ label: 'Gazebo-Modell als ZIP (SDF, Meshes, Texturen)', url: `${base}.zip`, format: 'zip', size: Number(row.filesize) || undefined }],
    meta: Object.keys(meta).length ? meta : undefined,
    collection: undefined,
    popularity: beliebtheit({ value: row.downloads, label: 'Downloads', name: source.name, url: `${APP}/${seg(row.owner)}/fuel/models/${seg(row.name)}` }),
  });
}

source.crawl = async function crawl(cfg = {}, log = () => {}) {
  setHostGap(HOST, Number(cfg.abstandMs) || 1500);
  const perPage = Math.min(Math.max(Number(cfg.proSeite) || 100, 10), 100);
  const budget = Math.max(1, Number(cfg.budget) || 40);
  const skipOwners = new Set((cfg.ausschliessen ?? []).map((o) => String(o).toLowerCase()));
  const heute = new Date().toISOString().slice(0, 10);
  const statePath = cfg.stand ?? STATE_FILE;
  const loaded = await loadJson(statePath, { version: 1, strang: emptyStrand(), gesehen: {} });
  let strand = prepareStrand(loaded.strang, { heute, nachTagen: cfg.wiederholenNachTagen });
  const seen = { ...(loaded.gesehen ?? {}) };
  const out = [];
  const drop = { lizenz: 0, ohneBild: 0, kopie: 0, besitzer: 0 };
  let used = 0;
  let stop = null;
  try {
    while (used < budget && !strand.fertig) {
      const page = Number(strand.weiter) || 1;
      used++;
      let rows;
      let total = NaN;
      try {
        const res = await politeFetch(requestUrl(page, perPage), { headers: { Accept: 'application/json' }, timeout: 60000 });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        total = Number(res.headers.get('x-total-count'));
        rows = await res.json();
      } catch (err) {
        stop = err.message;
        break;
      }
      if (!Array.isArray(rows)) {
        stop = 'Antwort ist keine Liste';
        break;
      }
      for (const row of rows) {
        if (skipOwners.has(String(row.owner).toLowerCase())) { drop.besitzer++; continue; }
        const it = parseModel(row);
        if (!it) {
          if (!normalizeLicense(row?.license_url) && !normalizeLicense(row?.license_name)) drop.lizenz++;
          else drop.ohneBild++;
          continue;
        }
        const key = cloneKey(row);
        if (seen[key] && seen[key] !== it.id) { drop.kopie++; continue; }
        seen[key] = it.id;
        out.push(it);
      }
      strand = advanceStrand(strand, nextPage(page, rows.length, total, perPage), heute);
    }
  } finally {
    await saveJson(statePath, { version: 1, strang: strand, gesehen: seen });
  }
  if (stop) log(`  fuel: Lauf abgebrochen (${stop})`);
  log(`  fuel: ${used}/${budget} Anfragen, ${out.length} Modelle, verworfen: ${drop.lizenz} Lizenz, ${drop.ohneBild} ohne Bild, ${drop.kopie} Kopien, ${drop.besitzer} Besitzer, ${strand.fertig ? 'Zyklus fertig' : `weiter ab Seite ${strand.weiter}`}`);
  return out;
};

export default source;
