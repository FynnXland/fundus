// OpenMoji (hfg-gmuend/openmoji, Schwäbisch Gmünd University of Design): one entry per emoji, about 2,450 without
// skin tone variants and brand icons. Checked 23.11.2026.
// - Licence: "OpenMoji graphics are licensed under the Creative Commons Share Alike License 4.0 (CC BY-SA 4.0)",
//   README of the repository, section "License"; suggested credit "All emojis designed by OpenMoji, the open-source
//   emoji and icon project. License: CC BY-SA 4.0". The Iconify record says the same (openmoji, CC-BY-SA-4.0).
//   Set by this adapter, not read from GitHub's licence field.
// - Data: data/openmoji.json of the repository (one request): hexcode, group, annotation, tags, designer.
//   Files: color/svg/<HEX>.svg, black/svg/<HEX>.svg, color/618x618/<HEX>.png (checked, 200, image/svg+xml, CORS open).
// - openmoji.org/robots.txt allows everything and asks AI training crawlers to use the GitHub repository; that is
//   what this adapter does (no request to openmoji.org besides the link on the card).
// - Skin tone variants (`skintone` set, about 2,000 of 4,568) and the component group are left out by default
//   (cfg.hauttoene = true brings the variants back).
import { getJson } from '../lib/http.mjs';
import { makeItem } from '../lib/item.mjs';
import { grossAnfang, gruppeDe, hatHautton, rawUrl, unicodeText } from './icons-helfer.mjs';

const REPO = 'hfg-gmuend/openmoji';
const REF = 'master';

const source = {
  id: 'openmoji',
  code: 'OM',
  name: 'OpenMoji',
  url: 'https://openmoji.org',
  kinds: ['icon'],
  terms: 'https://github.com/hfg-gmuend/openmoji#license',
};

const wort = (s) => String(s ?? '').replace(/-/g, ' ').trim();

/** One record of openmoji.json → entry, or null (skin tone variant, component, no annotation). */
export function parseEmoji(e, { hauttoene = false } = {}, now) {
  if (!e?.hexcode || !e.annotation || e.group === 'component') return null;
  if (!hauttoene && (e.skintone || hatHautton(e.hexcode))) return null;
  // brand icons (Twitter, Firefox, Github …) are trademarks, docs/RECHT.md: names only as text
  if (/^brand$/.test(e.subgroups ?? '')) return null;
  const hex = e.hexcode;
  const gruppe = wort(e.group);
  const schlagworte = String(e.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const eigene = String(e.openmoji_tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const meta = { stil: 'Emoji', gruppe: wort(e.group), unicode: unicodeText(hex) };
  if (e.openmoji_author && e.openmoji_author !== 'Unicode') meta.gestaltung = e.openmoji_author;
  return makeItem(source, {
    sourceId: hex,
    kind: 'icon',
    title: grossAnfang(e.annotation),
    // style tags first: the index row keeps only the first eight
    tags: ['emoji', 'openmoji', gruppeDe(e.group), gruppe, wort(e.subgroups), ...schlagworte, ...eigene],
    creator: { name: 'OpenMoji', url: 'https://openmoji.org' },
    // the openmoji.org/library page does not exist for every emoji (404 for 1FA8D, 1F6C7), the file on GitHub always does
    landing: `https://github.com/${REPO}/blob/${REF}/color/svg/${hex}.svg`,
    license: 'CC-BY-SA-4.0',
    collection: { id: 'openmoji', name: 'OpenMoji', url: 'https://openmoji.org/' },
    preview: { type: 'image', thumb: rawUrl(REPO, REF, `color/svg/${hex}.svg`) },
    downloads: [
      { label: 'Farbig (SVG)', url: rawUrl(REPO, REF, `color/svg/${hex}.svg`), format: 'svg' },
      { label: 'Schwarzweiß (SVG)', url: rawUrl(REPO, REF, `black/svg/${hex}.svg`), format: 'svg' },
      { label: 'PNG, 618 px', url: rawUrl(REPO, REF, `color/618x618/${hex}.png`), format: 'png' },
    ],
    meta,
  }, now);
}

export function parseOpenmoji(list, cfg = {}, now) {
  const seen = new Set();
  const out = [];
  for (const e of Array.isArray(list) ? list : []) {
    const it = parseEmoji(e, cfg, now);
    if (!it || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

source.crawl = async function crawl(cfg, log) {
  let list;
  try {
    list = await getJson(`https://raw.githubusercontent.com/${REPO}/${REF}/data/openmoji.json`, { timeout: 60000 });
  } catch (err) {
    log(`  openmoji: ${err.message}`);
    return [];
  }
  const out = parseOpenmoji(list, cfg);
  log(`  openmoji: ${out.length} von ${list.length} Einträgen übernommen (ohne Hauttöne und Bausteine)`);
  return out.slice(0, cfg.limit ?? Infinity);
};

export default source;
