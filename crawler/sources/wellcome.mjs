// Wellcome Collection catalogue (checked 23.11.2026, developers.wellcomecollection.org):
// - API: https://api.wellcomecollection.org/catalogue/v2/works, no key, no documented rate limit (kept at one request
//   per 1.5 s). Filter items.locations.locationType=iiif-image & items.locations.license=pdm,cc-by,cc-0 lists 76,029 works
//   (pdm 53,835, cc-by 23,838, cc-0 839 before the type split). The licence sits on the IIIF location of each work
//   (`license.id`: pdm, cc-by, cc-0, but also cc-by-nc, cc-by-nc-nd, inc …). Only pdm, cc-by and cc-0 pass; the
//   adapter checks that again per work.
// - The API serves only the first 10,000 works of a query (page 101 answers 400). Big groups are therefore cut into
//   strands: pdm pictures by production date, plus one plain strand each; whatever those leave out (about 20,000
//   undated pdm pictures, the last 4,800 cc-by digital images) is not reached. Sorting by production.dates does not help
//   (undated works keep the same order for asc and desc, checked 23.11.2026). The report says so.
// - Metadata is CC0 where Wellcome made it (docs/catalogue); the site content is CC BY 4.0. api.wellcomecollection.org has
//   no robots.txt (404), wellcomecollection.org only blocks named AI crawlers.
// - Images: iiif.wellcomecollection.org (IIIF 2, level 2). Bot UA: 200. A plain Chrome UA without browser headers gets
//   403 from the CloudFront WAF; a real browser loading the image as a cross-origin <img> without referrer works
//   (verified in the built-in browser from example.com, 400/1024/1600 px, status 200 image/jpeg). Landing pages
//   wellcomecollection.org/works/<id> answer the bot with 200.
// Work is spread over days: data/crawlstand/wellcome.json remembers the next page per strand.
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';
import { advanceStrand, loadJson, prepareStrand, saveJson } from './stand-helfer.mjs';

const API = 'https://api.wellcomecollection.org/catalogue/v2/works';
const HOST = 'api.wellcomecollection.org';
const STATE_FILE = 'data/crawlstand/wellcome.json';
const PAGE_SIZE = 100;
const MAX_PAGE = 100; // the API stops at 10,000 works per query

const source = {
  id: 'wellcome',
  code: 'C2',
  name: 'Wellcome Collection',
  url: 'https://wellcomecollection.org/collections',
  kinds: ['bild'],
  terms: 'https://wellcome.org/who-we-are/privacy-and-terms',
};

// Licence id of the IIIF location → code for makeItem. Nothing else passes.
const LICENSES = { 'cc-0': 'cc0', pdm: 'pdm', 'cc-by': 'by' };

const WINDOWS = [
  ['vor-1600', '1000-01-01', '1599-12-31'],
  ['1600er', '1600-01-01', '1699-12-31'],
  ['1700er', '1700-01-01', '1799-12-31'],
  ['1800-1849', '1800-01-01', '1849-12-31'],
  ['1850-1899', '1850-01-01', '1899-12-31'],
  ['1900-1949', '1900-01-01', '1949-12-31'],
  ['ab-1950', '1950-01-01', '2030-12-31'],
];

/** Default strands: every one stays under (or is cut at) the API cap of 10,000 works. */
export const DEFAULT_STRANDS = [
  ...WINDOWS.map(([id, from, to]) => ({ id: `pdm-bilder-${id}`, license: 'pdm', workType: 'k', from, to })),
  { id: 'pdm-bilder-alle', license: 'pdm', workType: 'k' },
  { id: 'pdm-digital', license: 'pdm', workType: 'q' },
  { id: 'pdm-handschriften', license: 'pdm', workType: 'h' },
  { id: 'by-digital', license: 'cc-by', workType: 'q' },
  { id: 'by-handschriften', license: 'cc-by', workType: 'h' },
  { id: 'by-bilder', license: 'cc-by', workType: 'k' },
  { id: 'cc0-digital', license: 'cc-0', workType: 'q' },
];

export function strandsFromConfig(cfg = {}) {
  const list = Array.isArray(cfg.straenge) && cfg.straenge.length ? cfg.straenge : DEFAULT_STRANDS;
  return list.filter((s) => s && typeof s.id === 'string' && LICENSES[s.license]);
}

export function requestUrl(strand, page) {
  return `${API}?${q({
    'items.locations.locationType': 'iiif-image',
    'items.locations.license': strand.license,
    workType: strand.workType,
    'production.dates.from': strand.from,
    'production.dates.to': strand.to,
    sort: strand.sort,
    sortOrder: strand.sortOrder,
    include: 'items,contributors,production,genres,subjects',
    pageSize: PAGE_SIZE,
    page,
  })}`;
}

/** Next page number of a strand, or null when it is at its end or at the API cap. */
export function nextPage(page, count, nextUrl) {
  if (!nextUrl || !count || count < PAGE_SIZE) return null;
  return page + 1 > MAX_PAGE ? null : page + 1;
}

const stripTags = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** One work from the catalogue API → catalogue entry, or null unless its IIIF image location carries pdm, cc-by or cc-0. */
export function parseWork(w) {
  if (!w || w.type !== 'Work' || !w.id) return null;
  const locations = (w.items ?? []).flatMap((i) => i.locations ?? []).filter((l) => l.locationType?.id === 'iiif-image');
  const loc = locations.find((l) => LICENSES[l.license?.id] && /^https:\/\/iiif\.wellcomecollection\.org\/image\/[^/]+\/info\.json$/.test(l.url ?? ''));
  if (!loc) return null;
  // Any image location with another licence, or one that is not openly viewable, makes the work unclear: leave it out.
  if (locations.some((l) => !LICENSES[l.license?.id])) return null;
  if ((loc.accessConditions ?? []).some((a) => a.status?.id && a.status.id !== 'open')) return null;
  const title = stripTags(w.title);
  if (!title) return null;

  const base = loc.url.replace(/\/info\.json$/, '');
  const primary = (w.contributors ?? []).find((c) => c.primary) ?? w.contributors?.[0];
  const credit = stripTags(loc.credit) || 'Wellcome Collection';
  const meta = {};
  const made = w.production?.[0]?.label;
  if (made) meta.entstanden = stripTags(made);
  if (w.workType?.label) meta.art = w.workType.label;
  if (w.referenceNumber) meta.signatur = String(w.referenceNumber);

  const tags = [...(w.genres ?? []).map((g) => g.label), ...(w.subjects ?? []).slice(0, 8).map((s) => s.label)]
    .map((t) => stripTags(t).toLowerCase())
    .filter(Boolean);
  return makeItem(source, {
    sourceId: w.id,
    kind: 'bild',
    title,
    tags: [...new Set(tags)],
    creator: { name: stripTags(primary?.agent?.label) || credit },
    landing: `https://wellcomecollection.org/works/${w.id}`,
    license: LICENSES[loc.license.id],
    preview: { type: 'image', thumb: `${base}/full/400,/0/default.jpg`, url: `${base}/full/1024,/0/default.jpg` },
    downloads: [
      { label: 'JPEG bis 3000 px', url: `${base}/full/!3000,3000/0/default.jpg`, format: 'jpg' },
      { label: 'JPEG in voller Auflösung', url: `${base}/full/max/0/default.jpg`, format: 'jpg' },
    ],
    meta: Object.keys(meta).length ? meta : undefined,
  });
}

/** The strand to work on next: unfinished strands with the fewest pages read come first. */
export function pickStrand(state, strands) {
  const open = strands.filter((s) => !state.straenge[s.id]?.fertig);
  open.sort((a, b) => (state.straenge[a.id]?.seiten ?? 0) - (state.straenge[b.id]?.seiten ?? 0));
  return open[0] ?? null;
}

source.crawl = async function crawl(cfg = {}, log = () => {}) {
  setHostGap(HOST, Number(cfg.abstandMs) || 1500);
  const budget = Math.max(1, Number(cfg.budget) || 40);
  const heute = new Date().toISOString().slice(0, 10);
  const statePath = cfg.stand ?? STATE_FILE;
  const strands = strandsFromConfig(cfg);
  const loaded = await loadJson(statePath, { version: 1, straenge: {} });
  const state = { version: 1, straenge: {} };
  for (const s of strands) state.straenge[s.id] = prepareStrand(loaded.straenge?.[s.id], { heute, nachTagen: cfg.wiederholenNachTagen });
  const found = new Map();
  let used = 0;
  let rejected = 0;
  let stop = null;
  try {
    while (used < budget) {
      const strand = pickStrand(state, strands);
      if (!strand) break;
      const cur = state.straenge[strand.id];
      const page = Number(cur.weiter) || 1;
      used++;
      let data;
      try {
        data = await getJson(requestUrl(strand, page), { timeout: 60000 });
      } catch (err) {
        stop = `${strand.id}: ${err.message}`;
        break;
      }
      const rows = Array.isArray(data.results) ? data.results : [];
      for (const w of rows) {
        const it = parseWork(w);
        if (it) found.set(it.id, it);
        else rejected++;
      }
      state.straenge[strand.id] = advanceStrand(cur, nextPage(page, rows.length, data.nextPage), heute);
    }
  } finally {
    await saveJson(statePath, state);
  }
  const done = strands.filter((s) => state.straenge[s.id]?.fertig).length;
  if (stop) log(`  wellcome: Lauf abgebrochen (${stop})`);
  log(`  wellcome: ${used}/${budget} Anfragen, ${found.size} Werke, ${rejected} verworfen, ${done}/${strands.length} Stränge fertig`);
  return [...found.values()];
};

export default source;
