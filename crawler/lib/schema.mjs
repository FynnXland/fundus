// One catalogue entry. Every adapter returns this shape; tests/data.test.mjs checks the whole catalogue against it.
//
// {
//   id:        "<quelle>:<id bei der Quelle>"            stable, used for the call number and dedupe
//   sig:       "3D·PH·K7Q2M"                             call number shown on the card
//   kind:      one of KINDS
//   title, description?, tags[]
//   creator:   { name, url? }
//   source:    { id, name, url }                          landing page at the origin (where the work lives)
//   via?:      [ "openverse" ]                            aggregators the entry was found through
//   license:   output of normalizeLicense()
//   attribution: ready-to-copy credit line
//   preview:   { type: "image"|"audio"|"model"|"text"|"font", url?, thumb?, text? }
//   downloads: [ { label, url, format?, size? } ]       direct file links at the origin
//   meta?:     free-form facts from the source (stars, duration, resolution …), only real values
//   hashes?:   { sha1?, md5?, sha256? } of the main file, when the source publishes them (used for dedupe)
//   collection?: { id, name, url? } a set the entry belongs to (icon set, skill collection, asset pack)
//   fetchedAt: ISO date of the crawl
// }

export const KINDS = {
  bild: { label: 'Bilder', code: 'BLD' },
  grafik: { label: '2D-Grafik & Sprites', code: 'GFX' },
  '3d': { label: '3D-Modelle', code: '3D' },
  textur: { label: 'Materialien', code: 'TEX' },
  hdri: { label: 'Umgebungen & Licht', code: 'HDR' },
  icon: { label: 'Icons & UI', code: 'ICO' },
  musik: { label: 'Musik', code: 'MUS' },
  sound: { label: 'Sounds', code: 'SND' },
  schrift: { label: 'Schriften', code: 'SCH' },
  skript: { label: 'Skripte', code: 'SKR' },
  projekt: { label: 'Projekte', code: 'PRJ' },
  skill: { label: 'Claude-Skills', code: 'SKL' },
  video: { label: 'Videos', code: 'VID' },
  shader: { label: 'Shader', code: 'SHD' },
};

const PREVIEW_TYPES = new Set(['image', 'audio', 'model', 'text', 'font']);

// FNV-1a, enough to give every id a short, stable call number.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function callNumber(kind, sourceCode, id) {
  const tail = hash(id).toString(36).toUpperCase().padStart(6, '0').slice(-5);
  return `${KINDS[kind]?.code ?? '?'}·${sourceCode}·${tail}`;
}

function isHttpUrl(u) {
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Returns a list of problems; empty list = valid. */
export function validateItem(item) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  need(typeof item.id === 'string' && item.id.includes(':'), 'id fehlt oder ohne Quellpräfix');
  need(typeof item.sig === 'string' && item.sig.length > 4, 'sig fehlt');
  need(item.kind in KINDS, `kind unbekannt: ${item.kind}`);
  need(typeof item.title === 'string' && item.title.trim().length > 0, 'title fehlt');
  need(item.creator && typeof item.creator.name === 'string', 'creator.name fehlt');
  need(item.source && isHttpUrl(item.source.url), 'source.url ungültig');
  need(item.license && item.license.id && isHttpUrl(item.license.url), 'license fehlt');
  need(typeof item.attribution === 'string' && item.attribution.length > 0, 'attribution fehlt');
  need(item.preview && PREVIEW_TYPES.has(item.preview.type), 'preview.type ungültig');
  if (item.preview?.url) need(isHttpUrl(item.preview.url), 'preview.url ungültig');
  if (item.preview?.thumb) need(isHttpUrl(item.preview.thumb), 'preview.thumb ungültig');
  need(Array.isArray(item.downloads) && item.downloads.length > 0, 'downloads leer');
  for (const d of item.downloads ?? []) need(isHttpUrl(d.url) && d.label, `download ungültig: ${d.url}`);
  need(Array.isArray(item.tags), 'tags kein Array');
  return errors;
}

/** Trims strings, drops empty tags, caps lengths so one odd source cannot bloat the index. */
export function tidy(item) {
  const cut = (s, n) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : s);
  return {
    ...item,
    title: cut(item.title, 160),
    description: item.description ? cut(stripHtml(item.description), 400) : undefined,
    tags: [...new Set((item.tags ?? []).map((t) => cut(String(t).toLowerCase(), 40)).filter(Boolean))].slice(0, 12),
    creator: { ...item.creator, name: cut(stripHtml(item.creator?.name ?? ''), 120) || 'unbekannt' },
  };
}

export function stripHtml(s) {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
