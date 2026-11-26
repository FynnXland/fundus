// Fonts that are only published on GitHub (not on Fontsource), from a short hand-picked list in config.json.
// Each entry is one repository: the licence comes from the repository (only OFL and Apache), the downloads are
// the files of the latest release, linked at GitHub. A font needs a file the previews can render (TTF or OTF),
// either as a release file or at a path in the repository.
//
// Checked and left out (26.11.2026): Minecraftia (Andrew Tyler, free for personal use only) and minefont
// (zoomlogo/minefont, MIT, but described as Mojang's Minecraft font tweaked, so the glyphs may not be its own).
import { getJson, setHostGap } from '../lib/http.mjs';
import { beliebtheit } from '../lib/bewertung.mjs';
import { makeItem } from '../lib/item.mjs';

const API = 'https://api.github.com';

const source = {
  id: 'githubschriften',
  code: 'GF',
  name: 'GitHub (Schriften)',
  url: 'https://github.com',
  kinds: ['schrift'],
  terms: 'https://docs.github.com/de/site-policy/github-terms/github-terms-of-service',
};

const ERLAUBT = new Set(['OFL-1.1', 'Apache-2.0']);
const FORMAT = (name) => name.match(/\.(ttf|otf|ttc|woff2?|zip)$/i)?.[1].toLowerCase();

const headers = () => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

/** One catalogue entry from the repository, its latest release and the hand-picked extras from config.json. */
export function parseSchrift(repo, release, extra = {}) {
  const spdx = repo.license?.spdx_id;
  if (!ERLAUBT.has(spdx) || repo.archived || repo.disabled) return null;
  const dateien = (release?.assets ?? []).filter((a) => FORMAT(a.name));
  const downloads = dateien
    // patched variants with thousands of extra symbols are large and for terminals only; the plain files come first
    .sort((a, b) => /nerd/i.test(a.name) - /nerd/i.test(b.name) || a.size - b.size)
    .map((a) => ({ label: a.name, url: a.browser_download_url, format: FORMAT(a.name), size: a.size }));
  const branch = repo.default_branch ?? 'main';
  const muster = extra.vorschau
    ? `https://raw.githubusercontent.com/${repo.full_name}/${branch}/${extra.vorschau}`
    : dateien.find((a) => /\.(ttf|otf)$/i.test(a.name) && !/nerd/i.test(a.name))?.browser_download_url;
  if (!muster) return null;
  if (!downloads.length) downloads.push({ label: 'Repository (ZIP)', url: `https://github.com/${repo.full_name}/archive/refs/heads/${branch}.zip`, format: 'zip' });
  return makeItem(source, {
    sourceId: repo.full_name.toLowerCase(),
    kind: 'schrift',
    title: extra.titel ?? repo.name,
    description: extra.beschreibung ?? repo.description ?? undefined,
    tags: extra.tags ?? [],
    creator: { name: extra.urheber ?? repo.owner?.login ?? 'unbekannt', url: repo.owner?.html_url },
    landing: repo.html_url,
    license: spdx,
    preview: { type: 'font', url: muster },
    downloads,
    meta: { kategorie: extra.kategorie, version: release?.tag_name },
    popularity: beliebtheit({ value: repo.stargazers_count, label: 'GitHub-Sterne', name: 'GitHub', url: repo.html_url }),
  });
}

source.crawl = async function crawl(cfg, log) {
  setHostGap('api.github.com', 1000);
  const out = [];
  for (const eintrag of cfg.repos ?? []) {
    try {
      const repo = await getJson(`${API}/repos/${eintrag.repo}`, { headers: headers() });
      const release = await getJson(`${API}/repos/${eintrag.repo}/releases/latest`, { headers: headers() }).catch(() => null);
      const it = parseSchrift(repo, release, eintrag);
      if (it) out.push(it);
      else log(`  githubschriften ${eintrag.repo}: Lizenz ${repo.license?.spdx_id ?? 'keine'} oder keine Schriftdatei, ausgelassen`);
    } catch (err) {
      log(`  githubschriften ${eintrag.repo}: ${err.message}`);
    }
  }
  log(`  githubschriften: ${out.length} Schriften`);
  return out;
};

export default source;
