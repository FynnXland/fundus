// OpenGameArt.org: free 2D art, 3D models, textures, music and sound effects for games.
//
// Access (checked 23.11.2026): there is no API. robots.txt allows "*" with Crawl-delay 10 and only disables
// /search/. The only machine-readable list the site offers is its own feed, https://opengameart.org/latest/rss.xml
// (the 10 newest submissions, not pageable). This adapter reads that one feed, one request per run, and does
// not scrape HTML pages. The catalogue therefore grows by what the feed shows on each run; a nightly run
// collects about the newest 10 submissions per day, older ones are not reachable this way.
//
// Licences: the feed lists every licence an author offers; the user may choose one, so the freest licence
// that passes the whitelist is taken (no credit needed first, then no share-alike). Entries that offer only
// OGA-BY (CC BY plus a DRM clause, not on the whitelist yet) or only licences outside it are left out and
// counted in the log.
//
// The feed's description is the rendered field list (art type, tags, licences, preview files, files); it
// carries no body text, so entries have no description.
import { politeFetch, setHostGap } from '../lib/http.mjs';
import { makeItem } from '../lib/item.mjs';
import { normalizeLicense } from '../lib/licenses.mjs';
import { decode } from './godotshaders.mjs';

const HOST = 'opengameart.org';
const FEED = `https://${HOST}/latest/rss.xml`;

const source = {
  id: 'opengameart',
  code: 'B4',
  name: 'OpenGameArt.org',
  url: `https://${HOST}`,
  kinds: ['grafik', '3d', 'textur', 'musik', 'sound'],
  terms: `https://${HOST}/content/faq`,
};

// Art types as the site names them. 2D Art, 3D Art, Music and Texture were seen in the feed on 23.11.2026;
// Sound Effect and Concept Art are the site's other art types. "Document" and anything unknown is dropped.
const ART = {
  '2d art': 'grafik',
  'concept art': 'grafik',
  '3d art': '3d',
  texture: 'textur',
  music: 'musik',
  'sound effect': 'sound',
};

/** Licence record for one licence name from the feed ("CC-BY 4.0", "GPL 3.0", "OGA-BY 4.0"), or null. */
export function licenseByName(name) {
  const s = String(name ?? '').trim();
  const gpl = s.match(/^(AGPL|LGPL|GPL)[\s-]*(\d\.\d)$/i);
  return normalizeLicense(gpl ? `${gpl[1].toUpperCase()}-${gpl[2]}` : s);
}

/** The freest licence among the offered ones: no credit needed, then no share-alike, then feed order. */
export function pickLicense(names) {
  const recs = names.map(licenseByName).filter(Boolean);
  // on a tie CC BY beats OGA-BY: same terms, but the better-known licence
  const oga = (r) => Number(r.id.startsWith('OGA-'));
  recs.sort((a, b) => Number(a.attribution) - Number(b.attribution) || Number(a.shareAlike) - Number(b.shareAlike) || oga(a) - oga(b));
  return recs[0] ?? null;
}

const section = (html, name) => {
  const parts = html.split('<div class="field field-name-');
  const hit = parts.find((p) => p.startsWith(`field-art-${name} `));
  return hit ?? '';
};

const fileLinks = (html) =>
  [...html.matchAll(/<a href="([^"]+)" type="([^";]+)(?:; length=(\d+))?"[^>]*>([^<]*)<\/a>/g)].map((m) => ({
    url: m[1],
    mime: m[2],
    size: m[3] ? Number(m[3]) : undefined,
    name: decode(m[4]).trim(),
  }));

const ext = (name) => name.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();

/**
 * @param xml  one <item> of the feed
 * @returns {{ item: object|null, grund?: 'art'|'lizenz'|'oga-by'|'format', art?: string }}
 */
export function parseEntry(xml) {
  // <guid isPermaLink="false"> carries an attribute, the other tags do not.
  const tag = (n) => xml.match(new RegExp(`<${n}(?: [^>]*)?>([\\s\\S]*?)</${n}>`))?.[1];
  const html = decode(tag('description') ?? '');
  const link = decode(tag('link') ?? '').trim();
  const id = decode(tag('guid') ?? '').match(/^(\d+) at /)?.[1];
  const title = decode(tag('title') ?? '').trim();
  if (!link || !id || !title) return { item: null, grund: 'format' };

  const artName = html.match(/field-name-field-art-type[\s\S]*?datatype="">([^<]*)</)?.[1]?.trim() ?? '';
  const kind = ART[artName.toLowerCase()];
  if (!kind) return { item: null, grund: 'art', art: artName || '?' };

  const names = [...section(html, 'licenses').matchAll(/class='license-name'>([^<]*)</g)].map((m) => decode(m[1]).trim());
  const license = pickLicense(names);
  if (!license) return { item: null, grund: names.length && names.every((n) => /^OGA-BY/i.test(n)) ? 'oga-by' : 'lizenz' };

  const tags = [...section(html, 'tags').matchAll(/datatype="">([^<]*)</g)].map((m) => decode(m[1]));
  const previews = fileLinks(section(html, 'preview'));
  const files = fileLinks(section(html, 'files'));
  if (!files.length) return { item: null, grund: 'format' };

  const image = previews.find((p) => p.mime.startsWith('image/'));
  const audio = previews.find((p) => p.mime.startsWith('audio/')) ?? (kind === 'musik' || kind === 'sound' ? files.find((f) => f.mime.startsWith('audio/')) : undefined);
  let preview;
  if ((kind === 'musik' || kind === 'sound') && audio) preview = { type: 'audio', url: audio.url, thumb: image?.url };
  else if (image) preview = { type: 'image', thumb: image.url, url: image.url };
  else preview = { type: 'text', text: title };

  const sizes = files.reduce((n, f) => n + (f.size ?? 0), 0);
  const meta = { art: artName };
  if (sizes) meta.groesse = sizes >= 1048576 ? `${(sizes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(sizes / 1024))} KB`;
  const item = makeItem(source, {
    sourceId: id,
    kind,
    title,
    tags,
    creator: { name: decode(tag('dc:creator') ?? '').trim() || 'unbekannt' },
    landing: link,
    license,
    preview,
    downloads: files.map((f) => ({ label: f.name || 'Datei', url: f.url, format: ext(f.name), size: f.size })),
    meta,
  });
  return item ? { item } : { item: null, grund: 'format' };
}

/** @param xml  the whole feed */
export function parseFeed(xml) {
  const items = [];
  const skipped = { art: {}, lizenz: 0, 'oga-by': 0, format: 0 };
  for (const part of String(xml ?? '').split('<item>').slice(1)) {
    const r = parseEntry(part.split('</item>')[0]);
    if (r.item) items.push(r.item);
    else if (r.grund === 'art') skipped.art[r.art] = (skipped.art[r.art] ?? 0) + 1;
    else skipped[r.grund]++;
  }
  return { items, skipped };
}

source.crawl = async function crawl(cfg, log) {
  // robots.txt: Crawl-delay 10. One request per run, the gap only matters if the adapter is called twice.
  setHostGap(HOST, 10000);
  try {
    const res = await politeFetch(FEED, { headers: { Accept: 'application/rss+xml' }, timeout: 45000 });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      log(`  opengameart: HTTP ${res.status}`);
      return [];
    }
    const { items, skipped } = parseFeed(await res.text());
    const art = Object.entries(skipped.art).map(([k, n]) => `${k} ${n}`).join(', ');
    log(`  opengameart: ${items.length} aus dem Feed, ausgelassen: OGA-BY ${skipped['oga-by']}, andere Lizenz ${skipped.lizenz}, Art ${art || '0'}, unlesbar ${skipped.format}`);
    return items;
  } catch (err) {
    log(`  opengameart: ${err.message}`);
    return [];
  }
};

export default source;
