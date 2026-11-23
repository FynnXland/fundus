// game-icons.net (repository game-icons/icons): one entry per icon, about 4,200 with the designer named per file.
// Checked 23.11.2026.
// - Licence: license.txt of the repository: "Icons provided under the Creative Commons 3.0 BY or CC0 if mentioned below.
//   Each sub-folders in this archive correspond to a different contributor". CC0 is marked for two designers
//   (Viscious Speed, Zeromancer); the adapter reads that from the file, everything else is CC BY 3.0. GitHub's licence
//   field says NOASSERTION, so the licence is set here. Credit: "Icons made by {author}. Available on https://game-icons.net"
//   (game-icons.net/about.html), "include a mention 'Icons made by {author}'" (license.txt).
// - Files: <designer>/<icon>.svg (white on black, 512 px), 200 image/svg+xml with CORS open. One tree request.
//   Landing page: https://game-icons.net/1x1/<designer>/<icon>.html (200). game-icons.net/robots.txt allows everything;
//   the site itself is not crawled, only linked.
// - Iconify has the same icons as the set "game-icons" (one entry for 4,133 icons, collection id game-icons); these are the
//   single, searchable entries with the right designer.
import { politeFetch } from '../lib/http.mjs';
import { makeItem } from '../lib/item.mjs';
import { githubFiles, rawUrl, titelAusDatei } from './icons-helfer.mjs';

const REPO = 'game-icons/icons';
const REF = 'master';

const source = {
  id: 'gameicons',
  code: 'GI',
  name: 'game-icons.net',
  url: 'https://game-icons.net',
  kinds: ['icon'],
  terms: 'https://game-icons.net/about.html',
};

const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** license.txt → Map from squashed designer name to { name, url, cc0 }. Only the "- Name, url - CC0" lines count. */
export function parseLicenseTxt(text) {
  const map = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^- (.+)$/);
    if (!m) continue;
    let rest = m[1].trim();
    const cc0 = /\s-\s*CC0\s*$/i.test(rest);
    rest = rest.replace(/\s-\s*CC0\s*$/i, '');
    const [name, ...url] = rest.split(/,\s*(?=https?:)/);
    const clean = name.trim();
    if (!clean || squash(clean).length < 2) continue;
    map.set(squash(clean), { name: clean, url: url.join(',').trim() || undefined, cc0 });
  }
  return map;
}

export function parseGameicons(files, designers, cfg = {}, now) {
  const out = [];
  for (const f of files) {
    const m = f.path.match(/^([a-z0-9-]+)\/([a-z0-9-]+)\.svg$/);
    if (!m) continue;
    const [, ordner, datei] = m;
    const d = designers.get(squash(ordner));
    const name = d?.name ?? titelAusDatei(ordner);
    const it = makeItem(source, {
      sourceId: `${ordner}/${datei}`,
      kind: 'icon',
      title: titelAusDatei(datei),
      tags: ['spiele', 'game icons', 'rollenspiel', name.toLowerCase(), ...datei.split('-')],
      creator: { name, url: d?.url },
      landing: `https://game-icons.net/1x1/${ordner}/${datei}.html`,
      license: d?.cc0 ? 'CC0-1.0' : 'CC-BY-3.0',
      collection: { id: 'game-icons', name: 'game-icons.net', url: 'https://game-icons.net' },
      preview: { type: 'image', thumb: rawUrl(REPO, REF, f.path) },
      downloads: [{ label: 'SVG (weiß auf schwarz)', url: rawUrl(REPO, REF, f.path), format: 'svg' }],
      meta: { stil: 'Spiele', raster: '512 px' },
    }, now);
    if (it) out.push(it);
  }
  return out;
}

source.crawl = async function crawl(cfg, log) {
  let files;
  let designers = new Map();
  try {
    files = await githubFiles(REPO, REF, { rekursiv: true });
    const res = await politeFetch(rawUrl(REPO, REF, 'license.txt'));
    if (res.ok) designers = parseLicenseTxt(await res.text());
  } catch (err) {
    log(`  gameicons: ${err.message}`);
    return [];
  }
  if (!designers.size) {
    // without the licence file the CC0 marks are unknown; CC0 icons would be credited as CC BY, which is harmless,
    // but the file is the source of the designer names, so this is a reason to stop and try again later
    log('  gameicons: license.txt nicht lesbar, Lauf abgebrochen');
    return [];
  }
  const out = parseGameicons(files, designers, cfg);
  log(`  gameicons: ${out.length} Einträge von ${designers.size} Gestaltern`);
  return out.slice(0, cfg.limit ?? Infinity);
};

export default source;
