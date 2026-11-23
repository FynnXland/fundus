// The same work often reaches us twice: directly from Wikimedia Commons and again through Openverse,
// which indexes Commons. Entries are matched by their normalised landing page and their main file URL.
// The direct entry wins; the aggregator is kept in `via`.

export function normalizeUrl(u) {
  if (!u) return '';
  try {
    const p = new URL(u);
    let path = decodeURIComponent(p.pathname).replace(/\/+$/, '');
    // Commons: /wiki/File:X and /wiki/Datei:X are the same page
    path = path.replace(/^\/wiki\/(Datei|Image|Bild):/i, '/wiki/File:').replace(/ /g, '_');
    // mobile hosts (m.example.org, commons.m.wikimedia.org) point to the same page
    const host = p.host.replace(/^www\./, '').replace(/(^|\.)m\./, '$1');
    // Query strings identify files on some hosts (ambientcg.com/get?file=…), so they stay, sorted.
    p.searchParams.sort();
    const query = p.searchParams.toString();
    return `${host}${path}${query ? `?${query}` : ''}`.toLowerCase();
  } catch {
    return String(u).toLowerCase();
  }
}

function keysOf(item) {
  const keys = [normalizeUrl(item.source?.url)];
  const main = item.downloads?.[0]?.url;
  if (main) keys.push(`file:${normalizeUrl(main)}`);
  return keys.filter(Boolean);
}

/** Direct sources beat aggregators; among equals the first one stays. */
function better(a, b) {
  const aggA = (a.via?.length ?? 0) > 0;
  const aggB = (b.via?.length ?? 0) > 0;
  if (aggA !== aggB) return aggA ? b : a;
  return a;
}

export function dedupe(items) {
  const byKey = new Map();
  const kept = [];
  for (const item of items) {
    const keys = keysOf(item);
    const existing = keys.map((k) => byKey.get(k)).find(Boolean);
    if (!existing) {
      const slot = { item };
      kept.push(slot);
      keys.forEach((k) => byKey.set(k, slot));
      continue;
    }
    const winner = better(existing.item, item);
    const loser = winner === item ? existing.item : item;
    const via = new Set([...(winner.via ?? []), ...(loser.via ?? [])]);
    existing.item = { ...winner, via: via.size ? [...via] : undefined };
    keys.forEach((k) => byKey.set(k, existing));
  }
  return kept.map((s) => s.item);
}

// ---------------------------------------------------------------------------------------------
// Content duplicates: the same file under different addresses (a skill copied into five collections,
// a Commons picture re-uploaded to Flickr). Matched by published checksums and, for pictures, by the
// dHash of the mini preview. Hashes with almost no structure (plain colours, simple icons) are ignored,
// they would merge unrelated entries.

// Only photographs and artworks are compared by picture. Rendered previews (material spheres, model
// turntables, HDRI balls) look alike across unrelated assets and produced false matches in the first run.
const BILDARTEN = new Set(['bild']);
const QUELLRANG = ['polyhaven', 'ambientcg', 'wikimedia', 'met', 'smithsonian', 'fontsource', 'iconify', 'github', 'internetarchive', 'freesound', 'openverse'];

function bits(hex) {
  let x = BigInt(`0x${hex}`);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

function abstand(a, b) {
  return bits((BigInt(`0x${a}`) ^ BigInt(`0x${b}`)).toString(16));
}

function rang(it) {
  const r = QUELLRANG.indexOf(it.source.id);
  return (it.via?.length ? 100 : 0) + (r < 0 ? 50 : r);
}

/**
 * @param items     catalogue entries
 * @param vorschau  register from crawler/thumbs.mjs ({ id: { dhash, b, h } })
 * @param maxAbstand  dHash distance that still counts as the same picture
 */
export function inhaltsDubletten(items, vorschau = {}, maxAbstand = 2) {
  const eltern = items.map((_, i) => i);
  const finde = (i) => (eltern[i] === i ? i : (eltern[i] = finde(eltern[i])));
  const vereine = (a, b) => { const x = finde(a), y = finde(b); if (x !== y) eltern[Math.max(x, y)] = Math.min(x, y); };

  // 1. identical published checksums
  const nachHash = new Map();
  items.forEach((it, i) => {
    for (const [alg, wert] of Object.entries(it.hashes ?? {})) {
      if (!wert) continue;
      const k = `${alg}:${String(wert).toLowerCase()}`;
      if (nachHash.has(k)) vereine(nachHash.get(k), i);
      else nachHash.set(k, i);
    }
  });

  // 2. near-identical pictures: four 16-bit bands; distance <= 2 means at least two bands are equal
  const baender = new Map();
  items.forEach((it, i) => {
    const v = vorschau[it.id];
    if (!BILDARTEN.has(it.kind) || !v?.dhash) return;
    const n = bits(v.dhash);
    if (n < 8 || n > 56) return;
    for (let b = 0; b < 4; b++) {
      const k = `${it.kind}:${b}:${v.dhash.slice(b * 4, b * 4 + 4)}`;
      const liste = baender.get(k) ?? [];
      // a crowded band (very common bit pattern) is skipped, the other three bands still catch real pairs
      if (liste.length > 300) continue;
      for (const j of liste) {
        const w = vorschau[items[j].id];
        const seitenA = v.b / v.h;
        const seitenB = w.b / w.h;
        // the same picture twice only happens across sources (a Commons file that is also on Flickr)
        const andereQuelle = items[j].source.name !== it.source.name;
        if (andereQuelle && Math.abs(seitenA - seitenB) / seitenA < 0.03 && abstand(v.dhash, w.dhash) <= maxAbstand) vereine(i, j);
      }
      liste.push(i);
      baender.set(k, liste);
    }
  });

  const gruppen = new Map();
  items.forEach((it, i) => {
    const r = finde(i);
    gruppen.set(r, [...(gruppen.get(r) ?? []), it]);
  });

  const out = [];
  let zusammengefuehrt = 0;
  for (const gruppe of gruppen.values()) {
    if (gruppe.length === 1) { out.push(gruppe[0]); continue; }
    gruppe.sort((a, b) => rang(a) - rang(b));
    const [sieger, ...rest] = gruppe;
    zusammengefuehrt += rest.length;
    out.push({
      ...sieger,
      tags: [...new Set([...sieger.tags, ...rest.flatMap((r) => r.tags)])].slice(0, 16),
      auch: rest.map((r) => ({ id: r.id, quelle: r.source.name, url: r.source.url, lizenz: r.license.name, downloads: r.downloads.filter((d) => !d.paket).slice(0, 3) })),
    });
  }
  return { items: out, zusammengefuehrt };
}
