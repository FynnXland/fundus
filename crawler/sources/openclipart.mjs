// Openclipart: public-domain vector clipart (SVG). Every clip is released under CC0 (openclipart.org/faq).
//
// Access (checked 23.11.2026): API v2 needs an account and an app (401 without). robots.txt allows "*" and
// lists the sitemap. This adapter reads the public Atom feed https://openclipart.org/feed: the 32 newest
// uploads with title, author, tags, the SVG and a PNG rendering. The feed is not pageable, so a nightly run
// collects the newest 32; the 38 sitemap files (about 186,000 clips) would give the whole collection, but
// carry no author and no tags. Whether to take that route is the operator's decision, it is not built here.
//
// Left out: clips tagged pd_issue (the public-domain status is in doubt) or nsfw. Remix tags
// ("remix+<id>") are references, not subjects, and are not kept as tags.
import { politeFetch, setHostGap } from '../lib/http.mjs';
import { makeItem } from '../lib/item.mjs';
import { decode } from './godotshaders.mjs';

const HOST = 'openclipart.org';
const FEED = `https://${HOST}/feed`;

const source = {
  id: 'openclipart',
  code: 'B3',
  name: 'Openclipart',
  url: `https://${HOST}`,
  kinds: ['grafik'],
  terms: `https://${HOST}/faq`,
};

const BLOCKED_TAGS = new Set(['pd_issue', 'nsfw']);

/** @returns {{ item: object|null, grund?: 'gesperrt'|'format' }}  xml = one <entry> */
export function parseEntry(xml) {
  const text = (n) => xml.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))?.[1];
  const id = decode(text('id') ?? '').match(/detail\/(\d+)$/)?.[1];
  const landing = xml.match(/<link href="([^"]+)" rel="alternate"/)?.[1];
  const title = decode(text('title') ?? '').trim();
  const svg = xml.match(/<link rel="enclosure" type="image\/svg\+xml" href="([^"]+)"/)?.[1];
  const png = xml.match(/<link rel="enclosure" type="image\/png" href="([^"]+)"/)?.[1];
  if (!id || !landing || !title || !svg) return { item: null, grund: 'format' };

  const terms = [...xml.matchAll(/<category [^>]*term="([^"]*)"/g)].map((m) => decode(m[1]).trim());
  if (terms.some((t) => BLOCKED_TAGS.has(t.toLowerCase()))) return { item: null, grund: 'gesperrt' };
  const tags = terms.filter((t) => t && !/^remix\+\d+$/i.test(t));

  const item = makeItem(source, {
    sourceId: id,
    kind: 'grafik',
    title,
    description: decode(text('summary') ?? ''),
    tags: ['clipart', 'vektor', ...tags],
    creator: { name: decode(xml.match(/<author><name>([\s\S]*?)<\/name>/)?.[1] ?? '').trim() || 'unbekannt' },
    landing: decode(landing),
    // The FAQ puts every upload under CC0.
    license: 'cc0',
    preview: png ? { type: 'image', thumb: decode(png), url: decode(png) } : { type: 'text', text: title },
    downloads: [
      { label: 'SVG (Vektor)', url: decode(svg), format: 'svg' },
      ...(png ? [{ label: 'PNG (800 px)', url: decode(png), format: 'png' }] : []),
    ],
    meta: { art: 'Clipart' },
  });
  return item ? { item } : { item: null, grund: 'format' };
}

/** @param xml  the whole Atom feed */
export function parseFeed(xml) {
  const items = [];
  const skipped = { gesperrt: 0, format: 0 };
  for (const part of String(xml ?? '').split('<entry>').slice(1)) {
    const r = parseEntry(part.split('</entry>')[0]);
    if (r.item) items.push(r.item);
    else skipped[r.grund]++;
  }
  return { items, skipped };
}

source.crawl = async function crawl(cfg, log) {
  setHostGap(HOST, 2000);
  try {
    const res = await politeFetch(FEED, { headers: { Accept: 'application/atom+xml' }, timeout: 45000 });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      log(`  openclipart: HTTP ${res.status}`);
      return [];
    }
    const { items, skipped } = parseFeed(await res.text());
    log(`  openclipart: ${items.length} aus dem Feed, ausgelassen: gesperrt (pd_issue/nsfw) ${skipped.gesperrt}, unlesbar ${skipped.format}`);
    return items;
  } catch (err) {
    log(`  openclipart: ${err.message}`);
    return [];
  }
};

export default source;
