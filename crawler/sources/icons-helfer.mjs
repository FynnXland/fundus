// Shared helpers of the icon adapters (openmoji, twemoji, notoemoji, fluentemoji, gameicons, streamline).
// All of them read one GitHub repository of an icon family: the file list comes from ONE tree request to the
// GitHub API (more with GITHUB_TOKEN set, the limit without a token is 60 requests per hour), previews and
// downloads are the raw files on raw.githubusercontent.com (CORS and CORP open, correct MIME type, no
// robots.txt). The Iconify API is not used here: its terms ask not to use it for anything but icon components.
// The emoji names (title, group) come from the Unicode emoji-test.txt, one request to unicode.org.
import { createHash } from 'node:crypto';
import { getJson, politeFetch } from '../lib/http.mjs';

export const RAW = 'https://raw.githubusercontent.com';
const API = 'https://api.github.com';

export const githubHeaders = () => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

export const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');
export const rawUrl = (repo, ref, path) => `${RAW}/${repo}/${ref}/${encodePath(path)}`;
export const blobUrl = (repo, ref, path) => `https://github.com/${repo}/blob/${ref}/${encodePath(path)}`;
export const folderUrl = (repo, ref, path) => `https://github.com/${repo}/tree/${ref}/${encodePath(path)}`;

/**
 * The files of a repository folder (or of the whole repository with `rekursiv`) as { path, size }.
 * A truncated answer (GitHub cuts trees at 100,000 entries or 7 MB) is an error, not a silent partial list.
 */
export async function githubFiles(repo, ref, { path = '', rekursiv = false } = {}) {
  const rev = path ? `${ref}:${path}` : ref;
  const data = await getJson(`${API}/repos/${repo}/git/trees/${rev}${rekursiv ? '?recursive=1' : ''}`, { headers: githubHeaders(), timeout: 60000 });
  if (data.truncated) throw new Error(`Dateiliste von ${repo} (${rev}) von GitHub abgeschnitten`);
  return (data.tree ?? []).filter((x) => x.type === 'blob').map((x) => ({ path: x.path, size: x.size }));
}

// ---------------------------------------------------------------------------------------------
// Emoji names

export const EMOJI_TEST = 'https://unicode.org/Public/emoji/latest/emoji-test.txt';

/** "1F468-200D-1F4BB", "emoji_u1f468_200d_1f4bb", "1f468 fe0f", "0023 FE0F 20E3" → "1f468-200d-1f4bb", "23-20e3" (lower case, no variation selector, no leading zeros as Twemoji writes them). */
export const hexKey = (s) => String(s).toLowerCase().replace(/^emoji_u/, '').split(/[-_\s]+/).filter((p) => p && p !== 'fe0f').map((p) => p.replace(/^0+(?=.)/, '')).join('-');

/** Skin tone modifiers U+1F3FB to U+1F3FF inside a sequence. */
export const hatHautton = (key) => hexKey(key).split('-').some((p) => /^1f3f[b-f]$/.test(p));

// German labels for the Unicode groups, added as tags so the German search finds them.
const GRUPPEN_DE = {
  'Smileys & Emotion': 'Smileys & Gefühle',
  'People & Body': 'Menschen & Körper',
  'Animals & Nature': 'Tiere & Natur',
  'Food & Drink': 'Essen & Trinken',
  'Travel & Places': 'Reisen & Orte',
  Activities: 'Aktivitäten',
  Objects: 'Gegenstände',
  Symbols: 'Symbole',
  Flags: 'Flaggen',
  Component: 'Bausteine',
};
// OpenMoji writes the same groups as slugs ("smileys-emotion") and adds two of its own.
const GRUPPEN_SLUG = {
  ...Object.fromEntries(Object.entries(GRUPPEN_DE).map(([k, v]) => [k.toLowerCase().replace(/[^a-z]/g, ''), v])),
  extrasopenmoji: 'OpenMoji-Extras',
  extrasunicode: 'Unicode-Extras',
};
export const gruppeDe = (g) => GRUPPEN_SLUG[String(g ?? '').toLowerCase().replace(/[^a-z]/g, '')] ?? g;

/**
 * emoji-test.txt → Map from hexKey to { name, group, subgroup }. Fully qualified lines win over the
 * unqualified ones (same name anyway). Also a Map from nameKey(name) to the same record.
 */
export function parseEmojiTest(text) {
  const byKey = new Map();
  const byName = new Map();
  let group = '';
  let subgroup = '';
  for (const line of String(text).split(/\r?\n/)) {
    const g = line.match(/^# group: (.+)$/);
    if (g) { group = g[1].trim(); continue; }
    const sg = line.match(/^# subgroup: (.+)$/);
    if (sg) { subgroup = sg[1].trim(); continue; }
    const m = line.match(/^([0-9A-F ]+?)\s*;\s*([a-z-]+)\s*#\s*\S+\s+E[\d.]+\s+(.+)$/);
    if (!m) continue;
    const key = hexKey(m[1]);
    const rec = { name: m[3].trim(), group, subgroup, status: m[2] };
    if (!byKey.has(key) || m[2] === 'fully-qualified') byKey.set(key, rec);
    if (!byName.has(nameKey(rec.name))) byName.set(nameKey(rec.name), rec);
  }
  return { byKey, byName };
}

let namen;
/** Loaded once per process; without the list the emoji adapters return nothing rather than nameless entries. */
export async function emojiNamen(log = () => {}) {
  namen ??= (async () => {
    try {
      const res = await politeFetch(EMOJI_TEST, { timeout: 60000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseEmojiTest(await res.text());
    } catch (err) {
      log(`  emoji-test.txt: ${err.message}`);
      return { byKey: new Map(), byName: new Map() };
    }
  })();
  return namen;
}
export const setzeEmojiNamen = (n) => { namen = Promise.resolve(n); };

/** Name → comparison key: "Eight o’clock" and "Eight oclock" meet. */
export const nameKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

export const grossAnfang = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const unicodeText = (key) => hexKey(key).split('-').map((p) => `U+${p.toUpperCase().padStart(4, '0')}`).join(' ');

// ---------------------------------------------------------------------------------------------

/** "fire-alarm-2" → "Fire alarm 2" */
export const titelAusDatei = (name) => grossAnfang(String(name).replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim());

/**
 * n entries picked by a hash of their key (the n smallest hashes), returned in list order. Unlike an even
 * spread by position, one file added upstream replaces at most one pick, so a later crawl does not shift the
 * choice (crawl.mjs never removes old entries, an unstable pick would pile up thumbnails).
 */
export function stabileAuswahl(list, n, schluessel = (x) => x.path) {
  if (!Number.isFinite(n) || n <= 0 || list.length <= n) return list;
  const mitHash = list.map((x, i) => ({ i, h: createHash('sha1').update(schluessel(x)).digest('hex') }));
  mitHash.sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
  return mitHash.slice(0, n).map((x) => x.i).sort((a, b) => a - b).map((i) => list[i]);
}
