// Europeana Search API (checked 23.11.2026 against the Europeana documentation, not against live answers):
// - Needs a key (env EUROPEANA_API_KEY, sent as X-Api-Key header, the documented preferred way; the wskey parameter is
//   deprecated). Without a key the adapter returns [] at once. No public demo key is released for testing in the
//   documentation, so no live call was possible and the fixture is rebuilt from the documentation (see fixtures/README.md).
// - API terms (europeana.eu/en/rights/terms-of-use, section Europeana API): personal keys are for non-production use,
//   production needs a project key; files behind edmPreview / edmIsShownBy may only be used under the rights statement
//   of the record, which is why every object is checked against the whitelist below, on top of reusability=open. No clause
//   forbids a catalogue of links, requests may be limited at any time.
// - reusability=open covers CC0, PDM, CC BY and CC BY-SA. Rights URL → licence code for makeItem; NC, ND and rightsstatements
//   URLs do not pass.
// - Thumbnails come from api.europeana.eu/thumbnail (edmPreview). The full file (edmIsShownBy) sits at the data provider,
//   many hosts, hotlink behaviour unchecked: it is offered as a download link only, the large preview is the thumbnail.
// - Work is spread over days: data/crawlstand/europeana.json keeps the cursor of each strand.
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';
import { advanceStrand, loadJson, prepareStrand, saveJson } from './stand-helfer.mjs';

const API = 'https://api.europeana.eu/record/v2/search.json';
const HOST = 'api.europeana.eu';
const STATE_FILE = 'data/crawlstand/europeana.json';

const source = {
  id: 'europeana',
  code: 'C6',
  name: 'Europeana',
  url: 'https://www.europeana.eu/',
  kinds: ['bild'],
  terms: 'https://www.europeana.eu/en/rights/terms-of-use',
};

/** Rights URL of a record → licence code for makeItem, or null. Version numbers of CC BY / BY-SA are read from the URL. */
export function europeanaLicense(url) {
  if (typeof url !== 'string') return null;
  const m = /^https?:\/\/creativecommons\.org\/(publicdomain\/(mark|zero)|licenses\/(by|by-sa))\/(\d\.\d)\/?$/.exec(url.trim());
  if (!m) return null;
  if (m[2] === 'mark') return 'pdm';
  if (m[2] === 'zero') return 'cc0';
  return { code: m[3], version: m[4] };
}

export const DEFAULT_STRANDS = [{ id: 'bilder', query: '*', qf: ['TYPE:IMAGE'] }];

export function strandsFromConfig(cfg = {}) {
  const list = Array.isArray(cfg.straenge) && cfg.straenge.length ? cfg.straenge : DEFAULT_STRANDS;
  return list.filter((s) => s && typeof s.id === 'string' && typeof s.query === 'string');
}

const first = (v) => (Array.isArray(v) ? v[0] : v);

/** One search item → catalogue entry, or null unless every rights URL is on the whitelist and an image preview exists. */
export function parseItem(r) {
  if (!r || r.type !== 'IMAGE') return null;
  // The documentation flags thumbnails that may not be redistributed (previewNoDistribute).
  if (r.previewNoDistribute === true) return null;
  const rights = Array.isArray(r.rights) ? r.rights : [r.rights];
  const lic = rights.map(europeanaLicense);
  if (!lic.length || lic.some((l) => !l)) return null;
  // Mixed statements: the first one decides the code, all of them passed the whitelist.
  const l0 = lic[0];
  const preview = first(r.edmPreview);
  const guid = r.guid;
  const id = typeof r.id === 'string' ? r.id : '';
  if (!/^\/[^/]+\/[^/]+$/.test(id) || typeof preview !== 'string' || !/^https:\/\/api\.europeana\.eu\/thumbnail\//.test(preview)) return null;
  if (typeof guid !== 'string' || !/^https:\/\/www\.europeana\.eu\//.test(guid)) return null;
  const title = String(first(r.title) ?? '').trim();
  if (!title) return null;
  const shown = first(r.edmIsShownBy);
  const downloads = [];
  if (typeof shown === 'string' && /^https?:\/\//.test(shown)) downloads.push({ label: 'Bild beim Datengeber', url: shown, format: 'jpg' });
  if (!downloads.length) return null;
  const meta = {};
  if (first(r.year)) meta.entstanden = String(first(r.year));
  const holder = first(r.dataProvider);
  return makeItem(source, {
    sourceId: id.slice(1).replace('/', '_'),
    kind: 'bild',
    title,
    creator: { name: String(first(r.dcCreator) ?? '').trim() || 'unbekannt' },
    originName: holder ? `Europeana, ${holder}` : undefined,
    landing: guid.split('?')[0],
    license: typeof l0 === 'string' ? l0 : l0.code,
    licenseVersion: typeof l0 === 'string' ? undefined : l0.version,
    preview: { type: 'image', thumb: preview, url: preview },
    downloads,
    meta: Object.keys(meta).length ? meta : undefined,
  });
}

export function requestUrl(strand, cursor, rows = 100) {
  const params = new URLSearchParams({ query: strand.query, reusability: 'open', media: 'true', thumbnail: 'true', profile: 'standard', rows: String(rows), cursor: cursor || '*' });
  for (const f of strand.qf ?? []) params.append('qf', f);
  return `${API}?${params}`;
}

source.crawl = async function crawl(cfg = {}, log = () => {}, env = process.env) {
  const key = env.EUROPEANA_API_KEY?.trim();
  if (!key) {
    log('  europeana: EUROPEANA_API_KEY fehlt, Quelle übersprungen (Schlüssel: https://apis.europeana.eu/)');
    return [];
  }
  setHostGap(HOST, Number(cfg.abstandMs) || 1500);
  const budget = Math.max(1, Number(cfg.budget) || 20);
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
    for (const strand of strands) {
      while (used < budget && !state.straenge[strand.id].fertig) {
        const cur = state.straenge[strand.id];
        used++;
        let data;
        try {
          data = await getJson(requestUrl(strand, cur.weiter), { headers: { 'X-Api-Key': key }, timeout: 60000 });
        } catch (err) {
          stop = `${strand.id}: ${err.message}`;
          break;
        }
        for (const r of data.items ?? []) {
          const it = parseItem(r);
          if (it) found.set(it.id, it);
          else rejected++;
        }
        state.straenge[strand.id] = advanceStrand(cur, data.nextCursor || null, heute);
      }
      if (stop || used >= budget) break;
    }
  } finally {
    await saveJson(statePath, state);
  }
  if (stop) log(`  europeana: Lauf abgebrochen (${stop})`);
  log(`  europeana: ${used}/${budget} Anfragen, ${found.size} Objekte, ${rejected} verworfen`);
  return [...found.values()];
};

export default source;
