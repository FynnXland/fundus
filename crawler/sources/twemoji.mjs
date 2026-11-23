// Twemoji (jdecked/twemoji, the community continuation of Twitter's emoji): one entry per emoji, about 1,900
// without skin tone variants. Checked 23.11.2026.
// - Licence: README of the repository, section "License": "Graphics licensed under CC-BY 4.0"; code under MIT.
//   LICENSE-GRAPHICS is the CC BY 4.0 text. GitHub's licence field says MIT (the code), so the graphics licence is
//   set here and not taken from the API. Credit as the README asks: "Twemoji by Twitter, Inc and other contributors".
// - File list: one tree request for assets/svg; files are assets/svg/<hex>.svg (lower case, no fe0f), 200 image/svg+xml.
// - The files carry no names. Titles and groups come from the Unicode emoji-test.txt; a file without a name there
//   (regional indicator letters, tag characters) is skipped.
import { makeItem } from '../lib/item.mjs';
import { blobUrl, emojiNamen, githubFiles, grossAnfang, gruppeDe, hatHautton, hexKey, rawUrl, unicodeText } from './icons-helfer.mjs';

const REPO = 'jdecked/twemoji';
const REF = 'main';

const source = {
  id: 'twemoji',
  code: 'TW',
  name: 'Twemoji',
  url: 'https://github.com/jdecked/twemoji',
  kinds: ['icon'],
  terms: 'https://github.com/jdecked/twemoji#license',
};

/**
 * @param files  [{ path }] of assets/svg
 * @param names  result of parseEmojiTest()
 */
export function parseTwemoji(files, names, cfg = {}, now) {
  const out = [];
  let ohneName = 0;
  for (const f of files) {
    if (!/\.svg$/.test(f.path)) continue;
    const base = f.path.replace(/\.svg$/, '');
    const key = hexKey(base);
    if (!cfg.hauttoene && hatHautton(key)) continue;
    const info = names.byKey.get(key);
    if (!info) { ohneName++; continue; }
    const pfad = `assets/svg/${f.path}`;
    const it = makeItem(source, {
      sourceId: base,
      kind: 'icon',
      title: grossAnfang(info.name),
      tags: ['emoji', 'twemoji', info.group, gruppeDe(info.group), info.subgroup.replace(/-/g, ' ')],
      creator: { name: 'Twitter, Inc. und andere Mitwirkende', url: 'https://github.com/jdecked/twemoji' },
      landing: blobUrl(REPO, REF, pfad),
      license: 'CC-BY-4.0',
      collection: { id: 'twemoji', name: 'Twemoji', url: 'https://github.com/jdecked/twemoji' },
      preview: { type: 'image', thumb: rawUrl(REPO, REF, pfad) },
      downloads: [{ label: 'SVG', url: rawUrl(REPO, REF, pfad), format: 'svg' }],
      meta: { stil: 'Emoji', gruppe: info.group, unicode: unicodeText(key) },
    }, now);
    if (it) out.push(it);
  }
  return { items: out, ohneName };
}

source.crawl = async function crawl(cfg, log) {
  let files;
  try {
    files = await githubFiles(REPO, REF, { path: 'assets/svg' });
  } catch (err) {
    log(`  twemoji: ${err.message}`);
    return [];
  }
  const names = await emojiNamen(log);
  if (!names.byKey.size) return [];
  const { items, ohneName } = parseTwemoji(files, names, cfg);
  log(`  twemoji: ${items.length} Einträge, ${ohneName} Dateien ohne Unicode-Namen übersprungen`);
  return items.slice(0, cfg.limit ?? Infinity);
};

export default source;
