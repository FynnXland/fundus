// Internet Archive, music only. Licences on archive.org are set by the uploader, so the crawler stays in
// curated collections (default: netlabels, releases uploaded by the labels themselves) and accepts only
// licence URLs from an exact whitelist; ported variants (/3.0/us/, /de/ …) and NC/ND are out.
// "audio_music" is deliberately not a default: it holds commercial releases tagged CC0 or PDM by
// uploaders (checked 23.11.2026), and "librivoxaudio" / "opensource_audio" are mostly speech.
// No documented rate limit was found; the crawler keeps one request per second on archive.org.
// Item descriptions are uploader texts and are not copied.
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem } from '../lib/item.mjs';

const SEARCH = 'https://archive.org/advancedsearch.php';
const ZIP_MAX = 300e6;

const source = {
  id: 'internetarchive',
  code: 'IA',
  name: 'Internet Archive',
  url: 'https://archive.org',
  kinds: ['musik'],
  terms: 'https://archive.org/about/terms',
};

// Exact licence URLs as they occur in the licenseurl field (both schemes are common).
const LICENSE_PATHS = ['publicdomain/zero/1.0/', 'licenses/by/3.0/', 'licenses/by/4.0/', 'licenses/by-sa/3.0/', 'licenses/by-sa/4.0/', 'publicdomain/mark/1.0/'];
export const LICENSE_URLS = LICENSE_PATHS.flatMap((p) => [`http://creativecommons.org/${p}`, `https://creativecommons.org/${p}`]);

const MP3_FORMATS = ['VBR MP3', '128Kbps MP3'];

const first = (v) => (Array.isArray(v) ? v[0] : v);
const fileUrl = (id, name) => `https://archive.org/download/${id}/${name.split('/').map(encodeURIComponent).join('/')}`;

function seconds(length) {
  if (!length) return null;
  const parts = String(length).split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function trackNo(f) {
  const n = parseInt(String(f.track ?? '').split('/')[0], 10);
  return Number.isFinite(n) ? n : Infinity;
}

/** First track of the album: lowest track number, then file name; VBR before 128 kbit/s. */
export function pickMp3(files = []) {
  return files
    .filter((f) => MP3_FORMATS.includes(f.format) && f.name)
    .sort((a, b) => trackNo(a) - trackNo(b) || a.name.localeCompare(b.name) || MP3_FORMATS.indexOf(a.format) - MP3_FORMATS.indexOf(b.format))[0] ?? null;
}

/** @param {object} data  response of https://archive.org/metadata/{identifier} */
export function parseItem(data) {
  const m = data?.metadata;
  if (!m?.identifier || !/^[A-Za-z0-9._-]+$/.test(m.identifier)) return null;
  const license = first(m.licenseurl);
  if (!LICENSE_URLS.includes(license)) return null;
  const mp3 = pickMp3(data.files);
  if (!mp3) return null;
  const id = m.identifier;
  // Some netlabel items name the artist only in the file tags.
  const creator = [m.creator].flat().filter(Boolean).join(', ') || mp3.creator || mp3.artist;
  const subjects = [m.subject].flat().filter(Boolean).flatMap((s) => String(s).split(/[;,]/)).map((s) => s.trim());

  const downloads = [{ label: `MP3: ${mp3.title || mp3.name.split('/').pop()}`, url: fileUrl(id, mp3.name), format: 'mp3', size: Number(mp3.size) || undefined }];
  const itemSize = Number(data.item_size);
  if (itemSize > 0 && itemSize < ZIP_MAX) downloads.push({ label: 'Ganzes Item (ZIP)', url: `https://archive.org/compress/${id}`, format: 'zip', size: itemSize });

  const meta = {};
  const dauer = seconds(mp3.length);
  if (dauer) meta.dauer = `${Math.round(dauer)} s`;
  const tracks = new Set((data.files ?? []).filter((f) => MP3_FORMATS.includes(f.format)).map((f) => f.original || f.name)).size;
  if (tracks > 1) meta.titel = String(tracks);
  const label = [m.collection].flat().find((c) => c && c !== 'netlabels' && !c.startsWith('fav-'));
  if (label) meta.sammlung = label;

  const hashes = {};
  if (/^[0-9a-f]{32}$/.test(mp3.md5 ?? '')) hashes.md5 = mp3.md5;
  if (/^[0-9a-f]{40}$/.test(mp3.sha1 ?? '')) hashes.sha1 = mp3.sha1;

  return makeItem(source, {
    sourceId: id,
    kind: 'musik',
    title: first(m.title) || id,
    tags: subjects,
    creator: { name: creator || 'unbekannt' },
    landing: `https://archive.org/details/${id}`,
    license,
    preview: { type: 'audio', url: downloads[0].url, thumb: `https://archive.org/services/img/${id}` },
    downloads,
    meta: Object.keys(meta).length ? meta : undefined,
    hashes: Object.keys(hashes).length ? hashes : undefined,
  });
}

export function searchUrl(collection, rows, page) {
  const licenses = LICENSE_URLS.map((u) => `licenseurl:"${u}"`).join(' OR ');
  const p = new URLSearchParams({ q: `mediatype:audio AND collection:"${collection}" AND (${licenses})` });
  for (const f of ['identifier', 'downloads', 'item_size']) p.append('fl[]', f);
  p.append('sort[]', 'downloads desc');
  p.set('rows', String(rows));
  p.set('page', String(page));
  p.set('output', 'json');
  return `${SEARCH}?${p}`;
}

source.crawl = async function crawl(cfg, log) {
  setHostGap('archive.org', 1000);
  const limit = cfg.limit ?? 100;
  const out = [];
  const seen = new Set();
  for (const collection of cfg.sammlungen ?? ['netlabels']) {
    const rows = Math.min(Math.max(limit * 2, 10), 100);
    for (let page = 1; out.length < limit && page <= (cfg.maxSeiten ?? 5); page++) {
      let docs;
      try {
        docs = (await getJson(searchUrl(collection, rows, page))).response?.docs ?? [];
      } catch (err) {
        log(`  internetarchive ${collection}: ${err.message}`);
        break;
      }
      for (const d of docs) {
        if (out.length >= limit) break;
        if (seen.has(d.identifier)) continue;
        seen.add(d.identifier);
        try {
          const it = parseItem(await getJson(`https://archive.org/metadata/${encodeURIComponent(d.identifier)}`));
          if (it) out.push(it);
        } catch (err) {
          log(`  internetarchive ${d.identifier}: ${err.message}`);
        }
      }
      if (docs.length < rows) break;
    }
  }
  return out;
};

export default source;
