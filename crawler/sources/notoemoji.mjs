// Noto Emoji (googlefonts/noto-emoji, Google): one entry per emoji, about 1,700 without skin tone variants. Checked 23.11.2026.
// - 2D (default): 2D/svg/emoji_u<hex>.svg. Licence file next to them, 2D/svg/LICENSE: "Licensed under the Apache License,
//   Version 2.0". README: "Tools and most image resources are under the Apache license, version 2.0"; the flags
//   (third_party/region-flags) are "in the public domain or otherwise exempt from copyright". GitHub's licence field
//   says OFL (the fonts), so the licence is set here.
// - 3D (cfg.dreiD = true, off by default): 3D/png/512/emoji_u<hex>.png, about 2,000 more without skin tones. The 3D folder
//   has no licence file of its own; only the repository-wide "most image resources ... Apache" covers it. That is
//   not a clear grant for these files, so the owner decides before it is switched on (docs/stand/fundus-icons.md).
//   One 512 px PNG is 150 to 250 KB, so a thumbnail run for them moves around 400 MB.
// - Titles and groups from the Unicode emoji-test.txt (the file names are only hex codes).
import { makeItem } from '../lib/item.mjs';
import { blobUrl, emojiNamen, githubFiles, grossAnfang, gruppeDe, hatHautton, hexKey, rawUrl, unicodeText } from './icons-helfer.mjs';

const REPO = 'googlefonts/noto-emoji';
const REF = 'main';

const source = {
  id: 'notoemoji',
  code: 'NE',
  name: 'Noto Emoji',
  url: 'https://github.com/googlefonts/noto-emoji',
  kinds: ['icon'],
  terms: 'https://github.com/googlefonts/noto-emoji/blob/main/2D/svg/LICENSE',
};

/**
 * @param files  [{ path }] of one folder (2D/svg or 3D/png/512)
 * @param variant  '2d' or '3d'
 */
export function parseNoto(files, names, variant, cfg = {}, now) {
  const ordner = variant === '3d' ? '3D/png/512' : '2D/svg';
  const endung = variant === '3d' ? 'png' : 'svg';
  const out = [];
  let ohneName = 0;
  for (const f of files) {
    const m = f.path.match(new RegExp(`^emoji_u([0-9a-f_]+)\\.${endung}$`));
    if (!m) continue;
    const key = hexKey(m[1]);
    if (!cfg.hauttoene && hatHautton(key)) continue;
    const info = names.byKey.get(key);
    if (!info) { ohneName++; continue; }
    const pfad = `${ordner}/${f.path}`;
    const dreiD = variant === '3d';
    const it = makeItem(source, {
      sourceId: `${variant}-${key}`,
      kind: 'icon',
      title: grossAnfang(info.name),
      tags: ['emoji', dreiD ? '3d' : 'noto', 'noto emoji', info.group, gruppeDe(info.group), info.subgroup.replace(/-/g, ' ')],
      creator: { name: 'Google Inc.', url: 'https://github.com/googlefonts/noto-emoji' },
      landing: blobUrl(REPO, REF, pfad),
      license: 'Apache-2.0',
      collection: { id: 'noto', name: dreiD ? 'Noto Emoji 3D' : 'Noto Emoji', url: 'https://github.com/googlefonts/noto-emoji' },
      preview: { type: 'image', thumb: rawUrl(REPO, REF, pfad) },
      downloads: [{ label: dreiD ? 'PNG, 512 px (3D)' : 'SVG', url: rawUrl(REPO, REF, pfad), format: endung }],
      meta: { stil: dreiD ? '3D' : 'Emoji', gruppe: info.group, unicode: unicodeText(key) },
    }, now);
    if (it) out.push(it);
  }
  return { items: out, ohneName };
}

source.crawl = async function crawl(cfg, log) {
  const names = await emojiNamen(log);
  if (!names.byKey.size) return [];
  const out = [];
  for (const [variant, path] of [['2d', '2D/svg'], ...(cfg.dreiD ? [['3d', '3D/png/512']] : [])]) {
    try {
      const files = await githubFiles(REPO, REF, { path });
      const r = parseNoto(files, names, variant, cfg);
      log(`  notoemoji ${variant}: ${r.items.length} Einträge, ${r.ohneName} Dateien ohne Unicode-Namen übersprungen`);
      out.push(...r.items);
    } catch (err) {
      log(`  notoemoji ${variant}: ${err.message}`);
    }
  }
  return out.slice(0, cfg.limit ?? Infinity);
};

export default source;
