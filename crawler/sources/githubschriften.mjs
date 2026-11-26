// Fonts that are only published on GitHub (not on Fontsource): a short hand-picked list in config.json (repos) and
// the repository search for open font licences (suchen, e.g. "topic:font license:ofl-1.1 stars:>10"). Families that
// Fontsource already has are left out. Found repositories are looked at once and then kept (the catalogue file
// holds them); at most cfg.maxNeu new ones per run, so a nightly run stays inside the API limit.
// Each entry is one repository: the licence comes from the repository (only OFL and Apache), the downloads are
// the files of the latest release, linked at GitHub. A font needs a file the previews can render (TTF or OTF),
// either as a release file or at a path in the repository.
//
// Checked and left out (26.11.2026): Minecraftia (Andrew Tyler, free for personal use only) and minefont
// (zoomlogo/minefont, MIT, but described as Mojang's Minecraft font tweaked, so the glyphs may not be its own).
import { getJson, setHostGap } from '../lib/http.mjs';
import { beliebtheit } from '../lib/bewertung.mjs';
import { makeItem } from '../lib/item.mjs';
import { ladeQuelle } from '../lib/store.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

// repositories looked at without a usable font file (font tools, sources only): not asked again
const STAND = 'data/crawlstand/githubschriften.json';

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

/** The font file a sample can be rendered from: a regular upright TTF (or OTF), as shallow as possible. */
export function musterDatei(pfade) {
  const schrift = pfade.filter((p) => /\.(ttf|otf)$/i.test(p) && !/nerd|test|sample|demo|unhinted\/.*variable/i.test(p));
  const punkte = (p) => (/regular/i.test(p) ? 0 : 10) + (/italic|oblique/i.test(p) ? 20 : 0) + (/\.ttf$/i.test(p) ? 0 : 1) + p.split('/').length;
  return schrift.sort((a, b) => punkte(a) - punkte(b) || a.length - b.length)[0];
}

const familie = (n = '') => n.toLowerCase().replace(/[-_ ]?(fonts?|typeface)$/i, '').replace(/[^a-z0-9]/g, '');

async function gefunden(cfg, log) {
  const repos = new Map();
  for (const q of cfg.suchen ?? []) {
    for (let seite = 1; seite <= 10; seite++) {
      try {
        const data = await getJson(`${API}/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100&page=${seite}`, { headers: headers() });
        for (const r of data.items ?? []) if (!r.fork && !r.archived) repos.set(r.full_name.toLowerCase(), r);
        if ((data.items ?? []).length < 100) break;
      } catch (err) {
        log(`  githubschriften Suche "${q}": ${err.message}`);
        break;
      }
    }
  }
  return [...repos.values()].sort((a, b) => b.stargazers_count - a.stargazers_count);
}

source.crawl = async function crawl(cfg, log) {
  setHostGap('api.github.com', 1000);
  const out = [];
  // repositories found by search: new ones only, the known ones stay in the catalogue file
  const bekannt = new Set((await ladeQuelle(source.id)).items.map((it) => it.id));
  const fontsource = new Set((await ladeQuelle('fontsource')).items.map((it) => familie(it.title)));
  const genannt = new Set((cfg.repos ?? []).map((e) => e.repo.toLowerCase()));
  let stand = { ausgelassen: [] };
  try { stand = JSON.parse(await readFile(STAND, 'utf8')); } catch {}
  const ausgelassen = new Set(stand.ausgelassen);
  let neu = 0, doppelt = 0, ohneDatei = 0;
  for (const repo of await gefunden(cfg, log)) {
    if (neu >= (cfg.maxNeu ?? 300)) break;
    const id = `${source.id}:${repo.full_name.toLowerCase()}`;
    if (genannt.has(repo.full_name.toLowerCase()) || bekannt.has(id) || ausgelassen.has(id)) continue;
    if (fontsource.has(familie(repo.name))) { doppelt++; continue; }
    neu++;
    try {
      const release = await getJson(`${API}/repos/${repo.full_name}/releases/latest`, { headers: headers() }).catch(() => null);
      let vorschau;
      if (!release?.assets?.some((a) => /\.(ttf|otf)$/i.test(a.name) && !/nerd/i.test(a.name))) {
        const baum = await getJson(`${API}/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`, { headers: headers() });
        vorschau = musterDatei((baum.tree ?? []).map((t) => t.path));
        if (!vorschau) { ohneDatei++; ausgelassen.add(id); continue; }
      }
      const it = parseSchrift(repo, release, { vorschau, tags: (repo.topics ?? []).filter((t) => !/^(font|fonts|typeface|typography|ofl)$/.test(t)).slice(0, 6) });
      if (it) out.push(it);
      else ausgelassen.add(id);
    } catch (err) {
      log(`  githubschriften ${repo.full_name}: ${err.message}`);
    }
  }
  await mkdir('data/crawlstand', { recursive: true });
  await writeFile(STAND, JSON.stringify({ ausgelassen: [...ausgelassen].sort() }));
  log(`  githubschriften: ${neu} neue Repositories angesehen, ${out.length} Schriften, ${doppelt} schon bei Fontsource, ${ohneDatei} ohne Schriftdatei`);
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
  return out;
};

export default source;
