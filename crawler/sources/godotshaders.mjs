// Godot Shaders (godotshaders.com), a community library of shaders for the Godot engine.
//
// Licence (checked 23.11.2026, godotshaders.com/license/ and /faq/): every shader is published under the
// licence its author picks, CC0, MIT or GNU GPL v3. "Shadertoy port" grants no licence of its own (the
// Shadertoy default is CC BY-NC-SA 3.0), so those shaders are out. The licence covers only the code:
// "The featured image, screenshots and videos … do not fall under this license." Fundus therefore keeps
// no picture of these entries (no thumb, no image preview); the card shows the start of the code instead.
// robots.txt allows everything; no terms of use that forbid crawling were found (no /terms page).
//
// Listing: the site's own JSON endpoint /wp-json/gds/v1/shaders (filter by licence, 100 per page) returns
// HTML cards without id or licence. Each shader page is fetched once: its <article> classes carry the
// licence, tags and shader type, the <pre> block the code. The licence is checked on the page again, the
// listing filter alone is not trusted. Downloads point at /wp-json/shader_data/shader/<id>, the site's
// JSON with the full code (there is no file download on the page).
//
// Work is spread over runs: data/crawlstand/godotshaders.json remembers which shader pages were read.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getJson, politeFetch, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';

const BASE = 'https://godotshaders.com';
const HOST = 'godotshaders.com';
const STATE_FILE = 'data/crawlstand/godotshaders.json';

const source = {
  id: 'godotshaders',
  code: 'GS',
  name: 'Godot Shaders',
  url: BASE,
  kinds: ['shader'],
  terms: 'https://godotshaders.com/license/',
};

export const LIZENZEN = { cc0: 'CC0', mit: 'MIT', gnu_gpl3: 'GPL-3.0' };

const ARTEN = {
  canvas_item: 'Canvas Item (2D)',
  spatial: 'Spatial (3D)',
  sky: 'Sky',
  particles: 'Particles',
  fog: 'Fog',
  compute: 'Compute',
  texture_blit: 'Texture Blit',
};

/** Decodes the HTML entities WordPress writes into titles and code blocks. */
export function decode(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

const slugOf = (url) => url.match(/\/shader\/([^/?#]+)\/?/)?.[1] ?? null;

/** Cards of one listing answer: [{ url, slug, title, author }]. */
export function parseCards(html) {
  const out = [];
  for (const part of String(html ?? '').split('<article').slice(1)) {
    const url = part.match(/class="gds-shader-card__link" href="([^"]+)"/)?.[1];
    const slug = url && slugOf(url);
    if (!slug) continue;
    out.push({
      url,
      slug,
      title: decode(part.match(/gds-shader-card__title">([^<]*)</)?.[1] ?? '').trim(),
      author: decode(part.match(/gds-shader-card__author">([^<]*)</)?.[1] ?? '').trim(),
    });
  }
  return out;
}

/** Highest Godot version named in the article classes ("godot_version-godot_version_44", "godot_version-4-7"). */
export function godotVersion(classes) {
  const versions = [...classes.matchAll(/godot_version-(?:godot_version_)?(\d)-?(\d)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  if (!versions.length) return undefined;
  versions.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  return `${versions[0][0]}.${versions[0][1]}`;
}

/** First lines of the code for the card, at most 12 lines and 600 characters. */
export function excerpt(code) {
  const lines = code.replace(/\r\n?/g, '\n').replace(/^\s*\n/, '').split('\n').slice(0, 12).join('\n');
  return lines.length > 600 ? `${lines.slice(0, 597)}…` : lines;
}

/** @param {string} html  shader page (or the trimmed fixture) @param {string} [url]  page address */
export function parseShaderPage(html, url) {
  const art = html.match(/<article id="post-(\d+)" class="([^"]*)"/);
  if (!art) return null;
  const [, id, classes] = art;
  if (!/\btype-shader\b/.test(classes)) return null;
  const lic = [...classes.matchAll(/shader_license-(\S+)/g)].map((m) => m[1]);
  // A post with no licence class or any class outside the list (shadertoy_port) is not used.
  if (!lic.length || lic.some((l) => !(l in LIZENZEN))) return null;
  const pre = html.match(/<pre class="[^"]*code-block[^"]*"><code[^>]*>([\s\S]*?)<\/code><\/pre>/);
  const code = pre ? decode(pre[1]) : '';
  if (!code.trim()) return null;

  const landing = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1] ?? url;
  if (!landing) return null;
  const title = decode(html.match(/<h1 class="entry-title">([^<]*)<\/h1>/)?.[1] ?? '').trim();
  const author = html.match(/class="author vcard"><a class="url fn n" href="([^"]+)">([^<]*)<\/a>/);
  const typ = classes.match(/shader_type-(\S+)/)?.[1];
  const tags = [...classes.matchAll(/shader_tag-(\S+)/g)].map((m) => m[1].replace(/-/g, ' '));

  const m = {};
  if (typ) m.art = ARTEN[typ] ?? typ.replace(/_/g, ' ');
  const godot = godotVersion(classes);
  if (godot) m.godot = godot;
  m.zeilen = String(code.replace(/\s+$/, '').split('\n').length);

  return makeItem(source, {
    sourceId: id,
    kind: 'shader',
    title: title || slugOf(landing) || id,
    tags: typ ? [...tags, typ.replace(/_/g, ' ')] : tags,
    creator: author ? { name: decode(author[2]).trim() || 'unbekannt', url: author[1] } : { name: 'unbekannt' },
    landing,
    // Several licence classes would be odd; the first one wins, all of them are on the list.
    license: LIZENZEN[lic[0]],
    preview: { type: 'text', text: excerpt(code) },
    downloads: [{ label: 'Shader-Code (JSON, Feld „code“)', url: `${BASE}/wp-json/shader_data/shader/${id}`, format: 'json' }],
    meta: m,
  });
}

export function listUrl(lizenz, page, perPage = 100) {
  return `${BASE}/wp-json/gds/v1/shaders?${q({ shader_license: lizenz, per_page: perPage, page })}`;
}

// ---------------------------------------------------------------------------------------------
// Crawl state (pure functions, tested in tests/adapters-arten.test.mjs).
// state = { version: 1, gesehen: { "<slug>": "2026-11-23" | "aus:2026-11-23" }, listen: { "<lizenz>": { komplett: bool } } }

export function emptyState() {
  return { version: 1, gesehen: {}, listen: {} };
}

/** Shader pages to read this run: unseen cards in listing order, each slug once, at most `budget`. */
export function pickTodo(state, cards, budget) {
  const seen = new Set(Object.keys(state?.gesehen ?? {}));
  const todo = [];
  for (const c of cards) {
    if (todo.length >= budget) break;
    if (seen.has(c.slug)) continue;
    seen.add(c.slug);
    todo.push(c);
  }
  return todo;
}

/** After the first complete listing of a licence, later runs stop at the first page that brings nothing new. */
export function listingDone(state, lizenz, pageCards, page, maxPages) {
  if (page >= maxPages || !pageCards.length) return true;
  if (!state?.listen?.[lizenz]?.komplett) return false;
  return pageCards.every((c) => state.gesehen?.[c.slug]);
}

async function loadState(path) {
  try {
    const st = JSON.parse(await readFile(path, 'utf8'));
    if (st?.version === 1 && st.gesehen) return { listen: {}, ...st };
  } catch {}
  return emptyState();
}

async function saveState(path, st) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(st, null, 1));
  await rename(`${path}.tmp`, path);
}

/**
 * True when the page is a real shader post whose licence was read and rejected (Shadertoy port). Only
 * those are marked "aus"; a page that cannot be read at all (markup changed, error page) stays open.
 */
export function licenceRejected(html) {
  return /<article id="post-\d+" class="[^"]*\btype-shader\b[^"]*\bshader_license-/.test(html);
}

/**
 * One crawl run with the network injected, so tests can play several runs against fake pages.
 * listPage(lizenz, page) -> { cards, maxPages } | throws;  readPage(card) -> { item } | { aus: true } | { stop: true } | {}
 * A licence counts as complete only when its listing ran to the end and every listed card has been read;
 * until then each run lists it in full again, so no older page drops out of view.
 */
export async function runOnce(state, { lizenzen, budget, maxSeiten = 60, heute, listPage, readPage, log = () => {}, deadline = Infinity }) {
  const out = [];
  const cards = [];
  const proLizenz = new Map();
  for (const lizenz of lizenzen) {
    const own = [];
    let toEnd = false;
    for (let page = 1; page <= maxSeiten; page++) {
      let res;
      try {
        res = await listPage(lizenz, page);
      } catch (err) {
        log(`  godotshaders Liste ${lizenz} Seite ${page}: ${err.message}`);
        break;
      }
      own.push(...res.cards);
      const max = Number(res.maxPages) || page;
      if (listingDone(state, lizenz, res.cards, page, max)) {
        toEnd = page >= max || !res.cards.length;
        break;
      }
    }
    cards.push(...own);
    proLizenz.set(lizenz, { own, toEnd });
  }

  for (const card of pickTodo(state, cards, budget)) {
    if (Date.now() > deadline) {
      log('  godotshaders: Zeitlimit erreicht');
      break;
    }
    const r = await readPage(card);
    if (r.stop) break;
    if (r.item) {
      state.gesehen[card.slug] = heute;
      out.push(r.item);
    } else if (r.aus) state.gesehen[card.slug] = `aus:${heute}`;
  }

  for (const [lizenz, { own, toEnd }] of proLizenz) {
    const read = toEnd && own.every((c) => state.gesehen[c.slug]);
    state.listen[lizenz] = { komplett: Boolean(state.listen[lizenz]?.komplett || read) };
  }
  return out;
}

source.crawl = async function crawl(cfg, log) {
  // A small shared host: one request every two seconds.
  setHostGap(HOST, Number(cfg.abstandMs) || 2000);
  const heute = new Date().toISOString().slice(0, 10);
  const statePath = cfg.stand ?? STATE_FILE;
  const state = await loadState(statePath);
  const perPage = Number(cfg.proSeite) || 100;

  const listPage = async (lizenz, page) => {
    const data = await getJson(listUrl(lizenz, page, perPage), { timeout: 45000 });
    return { cards: parseCards(data.html), maxPages: Number(data.max_pages) };
  };
  const readPage = async (card) => {
    let res;
    try {
      res = await politeFetch(card.url, { headers: { Accept: 'text/html' }, timeout: 45000 });
    } catch (err) {
      log(`  godotshaders ${card.slug}: ${err.message}`);
      return {};
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      log(`  godotshaders ${card.slug}: HTTP ${res.status}`);
      // 403/429 means the site wants fewer requests: stop here, the rest waits for the next run.
      return res.status === 403 || res.status === 429 ? { stop: true } : {};
    }
    const html = await res.text();
    const item = parseShaderPage(html, card.url);
    if (item) return { item };
    if (licenceRejected(html)) return { aus: true };
    log(`  godotshaders ${card.slug}: Seite nicht lesbar, bleibt offen`);
    return {};
  };

  let out = [];
  try {
    out = await runOnce(state, {
      lizenzen: (cfg.lizenzen ?? Object.keys(LIZENZEN)).filter((l) => l in LIZENZEN),
      budget: Math.max(0, Number(cfg.budget) || 200),
      maxSeiten: Number(cfg.maxSeiten) || 60,
      heute,
      listPage,
      readPage,
      log,
      deadline: Date.now() + (Number(cfg.maxMinuten) || 30) * 60000,
    });
  } finally {
    await saveState(statePath, state);
  }
  log(`  godotshaders: ${out.length} Shader, ${Object.keys(state.gesehen).length} Seiten bisher gelesen`);
  return out;
};

export default source;
