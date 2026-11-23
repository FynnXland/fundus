// Cleveland Museum of Art Open Access (checked 23.11.2026):
// - API: https://openaccess-api.clevelandart.org/api/artworks/ (no key). cc0=1&has_image=1 currently lists 41,902
//   works; `share_license_status` is "CC0" or "Copyrighted" per object, and only "CC0" passes the gate here.
//   The old host openapi.clevelandart.org does not resolve.
// - Terms (clevelandart.org/terms-and-conditions, section "Open Access Collection API"): the API exposes works the
//   museum believes are public domain, CC0 waiver for its own content, no ban on automated use, but it may limit
//   transactions at its discretion. robots.txt of the API host only disallows Amazonbot.
// - Images: openaccess-cdn.clevelandart.org (Cloudflare) answers 200 image/jpeg for the bot and a browser UA, no
//   referer check. `web` is about 750 px, `print` about 3400 px (JPEG), `full` is a TIFF of up to 190 MB.
// - Landing pages: clevelandart.org/art/<accession> redirects (308) to www.clevelandart.org, so the www form is stored.
// Work is spread over days: data/crawlstand/cleveland.json remembers the next offset.
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';
import { advanceStrand, emptyStrand, loadJson, prepareStrand, saveJson } from './stand-helfer.mjs';

const API = 'https://openaccess-api.clevelandart.org/api/artworks/';
const HOST = 'openaccess-api.clevelandart.org';
const STATE_FILE = 'data/crawlstand/cleveland.json';
const FIELDS = 'id,accession_number,share_license_status,title,creation_date,type,technique,department,culture,url,images,creators,copyright';

const source = {
  id: 'cleveland',
  code: 'C1',
  name: 'Cleveland Museum of Art',
  url: 'https://www.clevelandart.org/open-access',
  kinds: ['bild'],
  terms: 'https://www.clevelandart.org/terms-and-conditions',
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// "John Singleton Copley (American, born The Thirteen Colonies, 1738–1815)" → "John Singleton Copley"
const plainName = (description) => String(description ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();

/** One artwork from the API → catalogue entry, or null unless the object itself is marked CC0 and has an image. */
export function parseArtwork(a) {
  if (!a || a.share_license_status !== 'CC0') return null;
  // A CC0 object that still carries a rights holder line is contradictory: leave it out.
  if (typeof a.copyright === 'string' && a.copyright.trim()) return null;
  const acc = typeof a.accession_number === 'string' ? a.accession_number.trim() : '';
  const web = a.images?.web;
  if (!acc || !web?.url) return null;

  const artist = (a.creators ?? []).find((c) => c.role === 'artist') ?? a.creators?.[0];
  const creator = { name: plainName(artist?.description) || 'unbekannt' };
  const print = a.images.print;
  const full = a.images.full;
  const downloads = [];
  if (print?.url) downloads.push({ label: 'JPEG in hoher Auflösung', url: print.url, format: 'jpg', size: num(print.filesize) });
  if (full?.url) downloads.push({ label: 'TIFF in voller Auflösung', url: full.url, format: 'tif', size: num(full.filesize) });
  if (!downloads.length) downloads.push({ label: 'Bild (JPEG)', url: web.url, format: 'jpg', size: num(web.filesize) });

  const big = print?.url ? print : web;
  const w = num(big.width);
  const h = num(big.height);
  const meta = {};
  if (a.creation_date) meta.entstanden = String(a.creation_date);
  if (a.technique) meta.technik = String(a.technique);
  if (w && h) meta.abmessung = `${w} × ${h} px`;

  const tags = [a.type, a.department, ...(Array.isArray(a.culture) ? a.culture.slice(0, 2) : [])]
    .filter((t) => typeof t === 'string' && t.trim())
    .map((t) => t.trim());

  return makeItem(source, {
    sourceId: acc,
    kind: 'bild',
    title: String(a.title || '').trim() || 'Ohne Titel',
    tags: [...new Set(tags)],
    creator,
    landing: `https://www.clevelandart.org/art/${acc}`,
    license: 'cc0',
    preview: { type: 'image', thumb: web.url, url: web.url },
    downloads,
    meta: Object.keys(meta).length ? meta : undefined,
  });
}

export function requestUrl(offset, pageSize) {
  return `${API}?${q({ cc0: 1, has_image: 1, limit: pageSize, skip: offset, fields: FIELDS })}`;
}

/** Next offset, or null when this page was the last one. */
export function nextOffset(offset, count, total, pageSize) {
  if (!count || count < pageSize) return null;
  const next = offset + count;
  return Number.isFinite(total) && total > 0 && next >= total ? null : next;
}

source.crawl = async function crawl(cfg = {}, log = () => {}) {
  setHostGap(HOST, Number(cfg.abstandMs) || 1500);
  const pageSize = Math.min(Math.max(Number(cfg.proSeite) || 200, 10), 1000);
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
        data = await getJson(requestUrl(offset, pageSize), { timeout: 60000 });
      } catch (err) {
        stop = err.message;
        break;
      }
      const rows = Array.isArray(data.data) ? data.data : [];
      for (const row of rows) {
        const it = parseArtwork(row);
        if (it) out.push(it);
        else rejected++;
      }
      strand = advanceStrand(strand, nextOffset(offset, rows.length, Number(data.info?.total), pageSize), heute);
    }
  } finally {
    await saveJson(statePath, { version: 1, strang: strand });
  }
  if (stop) log(`  cleveland: Lauf abgebrochen (${stop})`);
  log(`  cleveland: ${used}/${budget} Anfragen, ${out.length} Werke, ${rejected} verworfen, ${strand.fertig ? 'Zyklus fertig' : `weiter ab ${strand.weiter}`}`);
  return out;
};

export default source;
