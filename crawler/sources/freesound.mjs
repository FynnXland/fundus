// Freesound APIv2 (checked 23.11.2026 against freesound.org/docs/api and the MTG/freesound source):
// - Token authentication with a free API key (freesound.org/apiv2/apply), sent as "Authorization: Token …"
//   so the key never shows up in URLs or log lines. Env FREESOUND_TOKEN; without it the adapter does nothing.
// - Limits for a standard key: 60 requests/min, 2000/day. page_size up to 150.
// - Originals need OAuth2 of the end user, so the linked file is the high quality MP3 preview
//   (cdn.freesound.org, answers hotlinked requests with Access-Control-Allow-Origin: *).
// - The search filter uses the licence names of the index ("Attribution", "Creative Commons 0");
//   NonCommercial and Sampling+ are left out. The `license` field of a result is the deed URL.
// - API terms (freesound.org/help/tos_api/) forbid full copies of the database, so the crawl stays small.
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';
import { normalizeLicense } from '../lib/licenses.mjs';

const API = 'https://freesound.org/apiv2';
const FIELDS = 'id,name,username,license,previews,tags,duration,filesize,type,url,is_explicit,md5';
const LICENSE_FILTER = 'license:("Attribution" OR "Creative Commons 0")';

const source = {
  id: 'freesound',
  code: 'FR',
  name: 'Freesound',
  url: 'https://freesound.org',
  kinds: ['sound'],
  terms: 'https://freesound.org/help/tos_api/',
};

/** Deed URL (normal case) or index name. A bare "Attribution" has no version and is dropped. */
export function freesoundLicense(raw) {
  if (typeof raw !== 'string') return null;
  if (/creativecommons\.org/i.test(raw)) return normalizeLicense(raw);
  if (raw.trim() === 'Creative Commons 0') return normalizeLicense('cc0');
  return null;
}

const mb = (bytes) => `${(bytes / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;

export function parseSound(r) {
  if (!r || r.is_explicit) return null;
  const license = freesoundLicense(r.license);
  const mp3 = r.previews?.['preview-hq-mp3'];
  if (!license || !mp3 || !r.url) return null;
  const meta = {};
  if (r.duration) meta.dauer = `${Math.round(r.duration)} s`;
  if (r.type) meta.original = `${String(r.type).toUpperCase()}${r.filesize ? `, ${mb(r.filesize)}` : ''} (bei Freesound nach Anmeldung)`;
  return makeItem(source, {
    sourceId: String(r.id),
    kind: 'sound',
    title: r.name || 'Ohne Titel',
    tags: r.tags ?? [],
    creator: { name: r.username || 'unbekannt', url: r.username ? `https://freesound.org/people/${encodeURIComponent(r.username)}/` : undefined },
    landing: r.url,
    license,
    preview: { type: 'audio', url: mp3 },
    downloads: [{ label: 'MP3 (Hörprobe in hoher Qualität)', url: mp3, format: 'mp3' }],
    meta: Object.keys(meta).length ? meta : undefined,
    hashes: r.md5 ? { md5: r.md5 } : undefined,
  });
}

source.crawl = async function crawl(cfg, log, env = process.env) {
  const token = env.FREESOUND_TOKEN?.trim();
  if (!token) {
    log('  freesound: FREESOUND_TOKEN fehlt, Quelle übersprungen (Schlüssel: https://freesound.org/apiv2/apply)');
    return [];
  }
  setHostGap('freesound.org', 1100); // 60 per minute
  const pageSize = Math.min(Number(cfg.proSuche) || 150, 150);
  const pages = Math.max(1, Number(cfg.seiten) || 1);
  const budget = Math.min(Number(cfg.budget) || 200, 2000);
  const out = [];
  let used = 0;
  outer: for (const term of cfg.suchen ?? []) {
    for (let page = 1; page <= pages; page++) {
      if (used >= budget) break outer;
      used++;
      const url = `${API}/search/?${q({ query: term, filter: LICENSE_FILTER, fields: FIELDS, page_size: pageSize, page })}`;
      try {
        const data = await getJson(url, { headers: { Authorization: `Token ${token}` }, timeout: 30000 });
        for (const r of data.results ?? []) {
          const it = parseSound(r);
          if (it) out.push(it);
        }
        if (!data.next) break;
      } catch (err) {
        log(`  freesound ${term} Seite ${page}: ${err.message}`);
        // 401/403/429: key invalid or limit reached, the remaining requests would fail as well.
        if (/HTTP (401|403|429)/.test(err.message)) break outer;
        break;
      }
    }
  }
  log(`  freesound: ${used} Anfragen`);
  return out;
};

export default source;
