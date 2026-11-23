// Microsoft Fluent Emoji (microsoft/fluentui-emoji): one entry per emoji with the 3D rendering as preview and
// the 3D PNG, the colour SVG, the flat SVG and the high contrast SVG as downloads; 1,595 entries, only the default
// skin tone. Checked 23.11.2026.
// - Licence: LICENSE of the repository, "MIT License, Copyright (c) Microsoft Corporation" (GitHub: MIT), no deviating
//   licence per folder. Iconify's fluent-emoji set carries the same MIT.
// - File list: ONE recursive tree request for the whole repository (27,000 entries, about 7 MB, not truncated on
//   23.11.2026). Structure: assets/<Name>/{3D,Color,Flat,High Contrast}/<name>_<style>.<ext>; emoji with skin tones have
//   an extra level (assets/<Name>/Default/3D/…, Dark/, Light/, Medium/ …), only Default is used.
// - 3D PNGs are real files (38 KB for "Grinning face"), no Git LFS pointers; raw.githubusercontent.com answers 200
//   image/png with CORS open.
// - Group and keywords: the folder names are the Unicode (CLDR) names, so group and subgroup are looked up in emoji-test.txt
//   by name; a miss only means no group tag.
import { makeItem } from '../lib/item.mjs';
import { emojiNamen, folderUrl, githubFiles, gruppeDe, nameKey, rawUrl } from './icons-helfer.mjs';

const REPO = 'microsoft/fluentui-emoji';
const REF = 'main';

const source = {
  id: 'fluentemoji',
  code: 'FE',
  name: 'Fluent Emoji',
  url: 'https://github.com/microsoft/fluentui-emoji',
  kinds: ['icon'],
  terms: 'https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE',
};

const STILE = [
  ['3D', '3D', 'png', 'PNG (3D)'],
  ['Color', 'Color', 'svg', 'SVG, farbig'],
  ['Flat', 'Flat', 'svg', 'SVG, flach'],
  ['High Contrast', 'High Contrast', 'svg', 'SVG, hoher Kontrast'],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Groups the flat file list of the repository by emoji folder: Map name → [relative path]. */
export function nachOrdner(files) {
  const map = new Map();
  for (const f of files) {
    const m = f.path.match(/^assets\/([^/]+)\/(.+)$/);
    if (!m) continue;
    if (!map.has(m[1])) map.set(m[1], []);
    map.get(m[1]).push(m[2]);
  }
  return map;
}

/** One emoji folder → entry, or null without a 3D picture. */
export function parseOrdner(name, dateien, names, now, belegt = new Set()) {
  const vorsatz = dateien.some((p) => /^3D\/[^/]+\.png$/.test(p)) ? '' : dateien.some((p) => /^Default\/3D\/[^/]+\.png$/.test(p)) ? 'Default/' : null;
  if (vorsatz === null) return null;
  const downloads = [];
  for (const [ordner, , ext, label] of STILE) {
    const kopf = `${vorsatz}${ordner}/`;
    const hit = dateien.find((p) => p.startsWith(kopf) && p.endsWith(`.${ext}`) && !p.slice(kopf.length).includes('/'));
    if (hit) downloads.push({ label, url: rawUrl(REPO, REF, `assets/${name}/${hit}`), format: ext });
  }
  if (!downloads.length || !downloads[0].url.endsWith('.png')) return null;
  const info = names.byName.get(nameKey(name));
  let id = slug(name);
  for (let n = 2; belegt.has(id); n++) id = `${slug(name)}-${n}`;
  belegt.add(id);
  return makeItem(source, {
    sourceId: id,
    kind: 'icon',
    title: name,
    tags: ['emoji', '3d', 'fluent emoji', ...(info ? [info.group, gruppeDe(info.group), info.subgroup.replace(/-/g, ' ')] : [])],
    creator: { name: 'Microsoft Corporation', url: 'https://github.com/microsoft/fluentui-emoji' },
    landing: folderUrl(REPO, REF, `assets/${name}`),
    license: 'MIT',
    collection: { id: 'fluent-emoji', name: 'Fluent Emoji', url: 'https://github.com/microsoft/fluentui-emoji' },
    preview: { type: 'image', thumb: downloads[0].url },
    downloads,
    meta: { stil: '3D', ...(info ? { gruppe: info.group } : {}) },
  }, now);
}

export function parseFluent(files, names, now) {
  const belegt = new Set();
  const out = [];
  for (const [name, dateien] of [...nachOrdner(files)].sort(([a], [b]) => a.localeCompare(b))) {
    const it = parseOrdner(name, dateien, names, now, belegt);
    if (it) out.push(it);
  }
  return out;
}

source.crawl = async function crawl(cfg, log) {
  let files;
  try {
    files = await githubFiles(REPO, REF, { rekursiv: true });
  } catch (err) {
    log(`  fluentemoji: ${err.message}`);
    return [];
  }
  const names = await emojiNamen(log);
  const out = parseFluent(files, names);
  log(`  fluentemoji: ${out.length} Einträge`);
  return out.slice(0, cfg.limit ?? Infinity);
};

export default source;
