// GitHub: projects, scripts and Claude Code skills.
// - Projects and scripts come from the repository search by topic. Only repos with a recognised
//   open licence (SPDX) that are neither forks nor archived.
// - Skills: every folder with a SKILL.md in a skill collection becomes one entry. The licence is the
//   LICENSE file inside the skill folder if there is one (anthropics/skills does this per skill), otherwise
//   the repository licence. Skills without a recognisable open licence are skipped.
// Without GITHUB_TOKEN: search 10/min, core API 60/h. With a token: 30/min and 5000/h.
import { getJson, politeFetch, setHostGap } from '../lib/http.mjs';
import { beliebtheit } from '../lib/bewertung.mjs';
import { makeItem } from '../lib/item.mjs';
import { normalizeLicense } from '../lib/licenses.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

// Same skill copied into several collections: identical SKILL.md text (whitespace normalised) = same skill.
const ZEILENENDE = /\r\n/g;
const ZEILENRAND = /[ \t]+$/gm;
export const skillHash = (md) => createHash('sha256').update(md.replace(ZEILENENDE, '\n').replace(ZEILENRAND, '').trim()).digest('hex');

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

const source = {
  id: 'github',
  code: 'GH',
  name: 'GitHub',
  url: 'https://github.com',
  kinds: ['projekt', 'skript', 'skill', 'grafik', 'sound', 'musik', 'textur', '3d'],
  terms: 'https://docs.github.com/de/site-policy/github-terms/github-terms-of-service',
};

const headers = () => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

const archiveUrl = (repo) => `https://github.com/${repo.full_name}/archive/refs/heads/${repo.default_branch}.zip`;

// Media kinds need a media licence. MIT or GPL on a repository of sounds or sprites says nothing reliable
// about the files in it (ripped game art and copyrighted audio often sit behind such a badge), so for
// these kinds only CC0, CC BY and CC BY-SA count.
const MEDIENARTEN = new Set(['grafik', 'sound', 'musik', 'textur', '3d', 'bild']);

export function parseRepo(repo, kind) {
  if (repo.fork || repo.archived || repo.disabled) return null;
  const license = normalizeLicense(repo.license?.spdx_id);
  if (!license) return null;
  if (MEDIENARTEN.has(kind) && !['cc', 'gemeinfrei'].includes(license.family)) return null;
  return makeItem(source, {
    sourceId: repo.full_name,
    kind,
    title: repo.name,
    description: repo.description,
    tags: repo.topics ?? [],
    creator: { name: repo.owner?.login ?? repo.full_name.split('/')[0], url: repo.owner?.html_url },
    landing: repo.html_url,
    license,
    preview: { type: 'text', text: repo.description ?? '' },
    downloads: [{ label: 'Quellcode (ZIP)', url: archiveUrl(repo), format: 'zip' }],
    meta: {
      sterne: String(repo.stargazers_count ?? 0),
      sprache: repo.language ?? undefined,
      zuletzt: repo.pushed_at?.slice(0, 10),
      repository: repo.full_name,
    },
    popularity: beliebtheit({ value: repo.stargazers_count, label: 'GitHub-Sterne', name: 'GitHub', url: repo.html_url }),
  });
}

/** Minimal YAML front matter reader for SKILL.md: name and description, single or folded lines. */
export function parseFrontMatter(md) {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  const lines = m[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^(name|description):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value === '>' || value === '|' || value === '>-' || value === '|-' || value === '') {
      const parts = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim());
      value = parts.join(' ');
    }
    out[kv[1]] = value.replace(/^["']|["']$/g, '');
  }
  return out;
}

export function detectLicenseText(text) {
  if (!text) return null;
  const head = text.slice(0, 1500);
  if (/Apache License\s+Version 2\.0/i.test(head)) return normalizeLicense('Apache-2.0');
  if (/^\s*MIT License/im.test(head) || /Permission is hereby granted, free of charge/i.test(head)) return normalizeLicense('MIT');
  if (/GNU GENERAL PUBLIC LICENSE\s+Version 3/i.test(head)) return normalizeLicense('GPL-3.0');
  if (/BSD 3-Clause/i.test(head)) return normalizeLicense('BSD-3-Clause');
  if (/Creative Commons Attribution 4\.0/i.test(head) && !/NonCommercial|NoDerivatives/i.test(head)) return normalizeLicense('CC-BY-4.0');
  if (/CC0 1\.0/i.test(head)) return normalizeLicense('CC0');
  return null;
}

export function skillItem({ repo, dir, front, license, files, md }) {
  const branch = repo.default_branch;
  const base = `${RAW}/${repo.full_name}/${branch}`;
  const path = dir ? `${dir}/` : '';
  const folder = dir.split('/').pop() || repo.name;
  const pkgFiles = files.map((f) => ({ path: `${folder}/${f.path.slice(path.length)}`, url: `${base}/${f.path.split('/').map(encodeURIComponent).join('/')}` }));
  const size = files.reduce((s, f) => s + (f.size ?? 0), 0);
  return makeItem(source, {
    sourceId: `${repo.full_name}/${dir || '.'}`,
    kind: 'skill',
    title: front.name || folder,
    description: front.description,
    tags: ['claude-code', 'skill', ...(repo.topics ?? []).filter((t) => !/^claude/.test(t)).slice(0, 4)],
    creator: { name: repo.owner?.login ?? repo.full_name.split('/')[0], url: repo.owner?.html_url },
    landing: `https://github.com/${repo.full_name}/tree/${branch}/${dir}`,
    license,
    preview: { type: 'text', text: front.description ?? '' },
    downloads: [
      { label: 'Skill-Ordner (ZIP)', url: `${base}/${path}SKILL.md`, format: 'zip', size, paket: { name: `${folder}-skill`, files: pkgFiles, size } },
      { label: 'Nur SKILL.md', url: `${base}/${path}SKILL.md`, format: 'md' },
      { label: 'Ganze Sammlung (ZIP)', url: archiveUrl(repo), format: 'zip' },
    ],
    meta: { sammlung: repo.full_name, dateien: String(files.length) },
    collection: { id: repo.full_name, name: repo.full_name, url: repo.html_url },
    hashes: md ? { sha256: skillHash(md) } : undefined,
    // a skill has no stars of its own: these are the stars of the collection it lives in (repository search answer)
    popularity: beliebtheit({ value: repo.stargazers_count, label: 'GitHub-Sterne', name: 'GitHub', url: repo.html_url }),
  });
}

/** All results of a search, page by page (GitHub stops at 1,000 per query, so callers split by star range). */
async function sucheAlle(query, log, maxSeiten = 10) {
  const alle = [];
  for (let seite = 1; seite <= maxSeiten; seite++) {
    try {
      const data = await getJson(`${API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=100&page=${seite}`, { headers: headers() });
      alle.push(...(data.items ?? []));
      if ((data.items ?? []).length < 100) break;
    } catch (err) {
      log(`  github Suche "${query}" Seite ${seite}: ${err.message}`);
      break;
    }
  }
  return alle;
}

const STAND = 'data/crawlstand/github.json';

async function anzahl(sterne) {
  const data = await getJson(`${API}/search/repositories?q=${encodeURIComponent(`stars:${sterne}`)}&per_page=1`, { headers: headers() });
  return data.total_count ?? 0;
}

const tag = (ms) => new Date(ms).toISOString().slice(0, 10);

/** A single star value with more than 1,000 repositories (below about 230 stars) is split by creation date. */
async function datumsBaender(wert, von, bis, zaehle, tiefe = 0) {
  const q = `${wert} created:${tag(von)}..${tag(bis)}`;
  if (tiefe >= 8 || bis - von < 864e5 * 2 || (await zaehle(q)) <= 1000) return [q];
  const mitte = von + Math.floor((bis - von) / 2 / 864e5) * 864e5;
  return [...(await datumsBaender(wert, von, mitte, zaehle, tiefe + 1)), ...(await datumsBaender(wert, mitte + 864e5, bis, zaehle, tiefe + 1))];
}

/** Star bands with fewer than 1,000 repositories each, from `von` stars upwards (GitHub shows 1,000 per search). */
export async function baender(von, bis = Infinity, zaehle = anzahl) {
  const q = bis === Infinity ? `>=${von}` : von === bis ? `${von}` : `${von}..${bis}`;
  const n = await zaehle(q);
  if (n <= 1000) return [q];
  if (von === bis) return datumsBaender(von, Date.parse('2008-01-01'), Date.now(), zaehle);
  const mitte = bis === Infinity ? von * 2 - 1 : Math.floor((von + bis) / 2);
  return [...(await baender(von, mitte, zaehle)), ...(await baender(mitte + 1, bis, zaehle))];
}

/**
 * Every repository with at least cfg.sterneAb stars, in bands. The bands are worked as a ring: each run reads at
 * most cfg.sterneSeiten result pages and the next run continues there, so the nightly run stays short while the
 * whole range comes round every few nights. Entries already read stay in the catalogue file meanwhile.
 */
async function sterneRing(cfg, log) {
  // a fixed slice (cfg.sterneBis, e.g. a catch-up from 900 to 999 stars) is read once in full and keeps no ring state
  if (cfg.sterneBis) {
    const liste = await baender(cfg.sterneAb, cfg.sterneBis);
    const out = [];
    let i = 0;
    for (const band of liste) {
      const repos = await sucheAlle(`stars:${band}`, log);
      for (const r of repos) { const it = parseRepo(r, 'projekt'); if (it) out.push(it); }
      log(`  github: Sternbereich ${++i}/${liste.length} (${band}): ${repos.length} Repositories, ${out.length} mit offener Lizenz`);
    }
    return out;
  }
  let stand = {};
  try { stand = JSON.parse(await readFile(STAND, 'utf8')); } catch {}
  const heute = new Date().toISOString().slice(0, 10);
  const alt = stand.berechnet && (Date.parse(heute) - Date.parse(stand.berechnet)) / 864e5 > 30;
  if (!stand.baender?.length || stand.ab !== cfg.sterneAb || alt) {
    stand = { ab: cfg.sterneAb, berechnet: heute, baender: await baender(cfg.sterneAb), naechstes: 0 };
    log(`  github: ${stand.baender.length} Sternbereiche ab ${cfg.sterneAb} Sternen berechnet`);
  }
  const out = [];
  let seiten = 0, fertig = 0;
  const budget = cfg.sterneSeiten ?? 150;
  while (seiten < budget && fertig < stand.baender.length) {
    const band = stand.baender[stand.naechstes % stand.baender.length];
    const repos = await sucheAlle(`stars:${band}`, log);
    seiten += Math.max(1, Math.ceil(repos.length / 100));
    for (const r of repos) { const it = parseRepo(r, 'projekt'); if (it) out.push(it); }
    stand.naechstes = (stand.naechstes + 1) % stand.baender.length;
    fertig++;
    log(`  github: Sternbereich ${fertig}/${Math.min(stand.baender.length, budget)} (${band}): ${repos.length} Repositories, ${out.length} mit offener Lizenz`);
  }
  await mkdir('data/crawlstand', { recursive: true });
  await writeFile(STAND, JSON.stringify(stand));
  log(`  github: ${fertig} von ${stand.baender.length} Sternbereichen gelesen, ${out.length} Projekte, weiter bei Bereich ${stand.naechstes}`);
  return out;
}

async function search(query, perPage, log) {
  try {
    const data = await getJson(`${API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}`, { headers: headers() });
    return data.items ?? [];
  } catch (err) {
    log(`  github Suche "${query}": ${err.message}`);
    return [];
  }
}

async function rawText(url) {
  const res = await politeFetch(url, { retries: 1 });
  return res.ok ? res.text() : null;
}

async function skillsOf(repo, cfg, log) {
  let tree;
  try {
    tree = await getJson(`${API}/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`, { headers: headers() });
  } catch (err) {
    log(`  github Baum ${repo.full_name}: ${err.message}`);
    return [];
  }
  if (tree.truncated) log(`  github ${repo.full_name}: Baum abgeschnitten (sehr großes Repo), Skills können fehlen`);
  const blobs = (tree.tree ?? []).filter((t) => t.type === 'blob');
  const skillDirs = blobs
    .filter((b) => /(^|\/)SKILL\.md$/.test(b.path))
    .map((b) => b.path.replace(/\/?SKILL\.md$/, ''))
    .slice(0, cfg.skillsProRepo ?? 40);
  const repoLicense = normalizeLicense(repo.license?.spdx_id);
  const out = [];
  for (const dir of skillDirs) {
    const prefix = dir ? `${dir}/` : '';
    // a skill folder: its own files, without nested skills
    const files = blobs.filter((b) => b.path.startsWith(prefix) && !skillDirs.some((d) => d !== dir && d.startsWith(prefix) && b.path.startsWith(`${d}/`)));
    if (files.length > 80 || files.reduce((s, f) => s + (f.size ?? 0), 0) > 20 * 1024 * 1024) continue;
    const base = `${RAW}/${repo.full_name}/${repo.default_branch}/${prefix}`;
    const md = await rawText(`${base}SKILL.md`);
    if (!md) continue;
    const lic = files.find((f) => new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}LICEN[CS]E(\\.(txt|md))?$`, 'i').test(f.path));
    let license = repoLicense;
    if (lic) license = detectLicenseText(await rawText(`${RAW}/${repo.full_name}/${repo.default_branch}/${lic.path}`));
    if (!license) continue;
    const it = skillItem({ repo, dir, front: parseFrontMatter(md), license, files, md });
    if (it) out.push(it);
  }
  return out;
}

/**
 * Which repositories are read for skills: the named collections (cfg.skillRepos) first, then the found ones by stars,
 * at most cfg.skillReposMax of those. The most starred repos win the places, not the ones the first query listed.
 * cfg.skillAusschliessen names repos that only ship a few skills next to something else (apps, tools); they are not
 * taken from the search, only when listed in skillRepos.
 */
export function waehleSkillRepos(repos, cfg) {
  const raus = new Set((cfg.skillAusschliessen ?? []).map((n) => n.toLowerCase()));
  const genannt = (cfg.skillRepos ?? []).map((n) => repos.find((r) => r.full_name.toLowerCase() === n.toLowerCase())).filter(Boolean);
  const gefunden = repos.filter((r) => !genannt.includes(r) && !raus.has(r.full_name.toLowerCase())).sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0));
  return [...genannt, ...gefunden.slice(0, cfg.skillReposMax ?? 12)];
}

source.crawl = async function crawl(cfg, log) {
  setHostGap('api.github.com', process.env.GITHUB_TOKEN ? 2100 : 6500);
  setHostGap('raw.githubusercontent.com', 150);
  if (!process.env.GITHUB_TOKEN) log('  github: ohne GITHUB_TOKEN, das dauert wegen der Ratenlimits ein paar Minuten');
  const out = [];
  const per = cfg.proSuche ?? 25;
  // The most starred open-source projects, whatever their topic. They come first, so a topic search below that
  // knows the kind better (skript, grafik …) overrides them.
  if (cfg.sterneAb) out.push(...(await sterneRing(cfg, log)));
  if (cfg.nurSterne) return out;
  for (const query of cfg.projekte ?? []) for (const r of await search(query, per, log)) { const it = parseRepo(r, 'projekt'); if (it) out.push(it); }
  for (const query of cfg.skripte ?? []) for (const r of await search(query, per, log)) { const it = parseRepo(r, 'skript'); if (it) out.push(it); }
  // Asset repositories (sprite packs, sound packs, texture sets): the entry is the repository under the
  // licence GitHub detects for it. Single files inside may carry their own terms; the card links to the repo.
  for (const { q: query, art } of cfg.weitere ?? []) for (const r of await search(query, per, log)) { const it = parseRepo(r, art); if (it) out.push(it); }

  const repos = new Map();
  for (const full of cfg.skillRepos ?? []) {
    try {
      const r = await getJson(`${API}/repos/${full}`, { headers: headers() });
      repos.set(r.full_name, r);
    } catch (err) {
      log(`  github ${full}: ${err.message}`);
    }
  }
  for (const query of cfg.skillSuchen ?? []) {
    for (const r of await search(query, per, log)) if (!r.fork && !r.archived && !repos.has(r.full_name)) repos.set(r.full_name, r);
  }
  const chosen = waehleSkillRepos([...repos.values()], cfg);
  for (const repo of chosen) out.push(...(await skillsOf(repo, cfg, log)));
  return out;
};

export default source;
