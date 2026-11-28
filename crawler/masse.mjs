// Sizes of 3D models that the source does not state (Fuel, Khronos): read from the model file itself and kept in
// data/masse.json, keyed by entry id. Only the three numbers are stored, never the file. crawler/publish.mjs puts them
// into meta.abmessung, marked as measured, where the source gave none (Poly Haven gives its own).
//
//   node crawler/masse.mjs                    models not measured yet, at most 30 minutes
//   node crawler/masse.mjs --max-minuten 300  longer run (first pass)
//   node crawler/masse.mjs --quelle khronos   one source
//
// How, per source:
// - Khronos (glTF sample models): the POSITION accessors carry min and max (the glTF spec requires them), so the JSON
//   part of the file is enough: a .gltf is JSON, a .glb has it at the start (one ranged request). Node transforms
//   (matrix or translation/rotation/scale) are applied to the corners of each box. glTF is in metres with Y up, but
//   several sample models are not to scale; results outside 1 mm to 500 m are dropped.
// - Fuel (Gazebo models): model.sdf names the visual meshes and their scale; only those mesh files are fetched (OBJ,
//   Collada, STL, glTF), not the whole ZIP. Gazebo works in metres with Z up. Box, cylinder and sphere visuals count
//   too. Poses of links and visuals are taken as offsets without rotation, so a model of several parts is rough.
// A failed model is noted with its reason and tried again after 30 days; a server error is not noted at all.

import { readFile, writeFile } from 'node:fs/promises';
import { politeFetch, setHostGap } from './lib/http.mjs';
import { ladeKatalog } from './lib/store.mjs';

const DATEI = 'data/masse.json';
const MAX_MESH = 60e6; // a mesh file above this is skipped (rare; Fuel's median model ZIP is 4.6 MB)
const NOCHMAL_TAGE = 30;
const QUELLEN = ['khronos', 'fuel'];

export async function ladeMasse() {
  try { return JSON.parse(await readFile(DATEI, 'utf8')); } catch { return {}; }
}

/* ---------------- geometry ---------------- */

const leer = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
const dazu = (box, p) => { for (let i = 0; i < 3; i++) { if (p[i] < box.min[i]) box.min[i] = p[i]; if (p[i] > box.max[i]) box.max[i] = p[i]; } };
const vereint = (a, b) => { if (Number.isFinite(b.min[0])) { dazu(a, b.min); dazu(a, b.max); } return a; };
const ausdehnung = (box) => (Number.isFinite(box.min[0]) ? box.max.map((v, i) => v - box.min[i]) : null);

// 4x4 matrices, column-major as in glTF
const EINHEIT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mal(a, b) {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let z = 0; z < 4; z++) for (let k = 0; k < 4; k++) r[c * 4 + z] += a[k * 4 + z] * b[c * 4 + k];
  return r;
}
function trs(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const anwenden = (m, p) => [0, 1, 2].map((i) => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);

/** Bounding box of a glTF scene from its JSON alone (accessor min/max, node transforms). */
export function gltfBox(j) {
  const box = leer();
  const besuche = (ni, eltern, tiefe) => {
    const n = j.nodes?.[ni];
    if (!n || tiefe > 64) return;
    const welt = mal(eltern, n.matrix ?? trs(n.translation, n.rotation, n.scale));
    if (n.mesh != null) {
      for (const p of j.meshes?.[n.mesh]?.primitives ?? []) {
        const a = j.accessors?.[p.attributes?.POSITION];
        if (!a?.min || !a?.max) continue;
        for (const ex of [a.min[0], a.max[0]]) for (const ey of [a.min[1], a.max[1]]) for (const ez of [a.min[2], a.max[2]]) dazu(box, anwenden(welt, [ex, ey, ez]));
      }
    }
    for (const c of n.children ?? []) besuche(c, welt, tiefe + 1);
  };
  const szene = j.scenes?.[j.scene ?? 0];
  for (const ni of szene?.nodes ?? (j.nodes ?? []).map((_, i) => i)) besuche(ni, EINHEIT, 0);
  return box;
}

/** JSON part of a .glb (bytes from the start of the file), or null when the bytes do not reach its end. */
export function glbJson(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 20 || b.toString('latin1', 0, 4) !== 'glTF') throw new Error('keine glb-Datei');
  const laenge = b.readUInt32LE(12);
  if (b.length < 20 + laenge) return { fehlt: 20 + laenge };
  return JSON.parse(b.subarray(20, 20 + laenge).toString('utf8'));
}

export function objBox(text) {
  const box = leer();
  for (const m of text.matchAll(/^v[ \t]+(\S+)[ \t]+(\S+)[ \t]+(\S+)/gm)) {
    const p = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (p.every(Number.isFinite)) dazu(box, p);
  }
  return box;
}

export function stlBox(bytes) {
  const b = Buffer.from(bytes);
  const box = leer();
  const anzahl = b.length >= 84 ? b.readUInt32LE(80) : 0;
  if (b.length === 84 + anzahl * 50 && anzahl > 0) {
    for (let t = 0; t < anzahl; t++) for (let v = 0; v < 3; v++) {
      const o = 84 + t * 50 + 12 + v * 12;
      dazu(box, [b.readFloatLE(o), b.readFloatLE(o + 4), b.readFloatLE(o + 8)]);
    }
    return box;
  }
  for (const m of b.toString('latin1').matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) dazu(box, [Number(m[1]), Number(m[2]), Number(m[3])]);
  return box;
}

/**
 * Collada: the positions of every mesh (float arrays the POSITION inputs point to), scaled by <unit meter>, turned to
 * Z up when the file says Y_UP. Node transforms are not applied (rough).
 */
export function daeBox(text) {
  const meter = Number(/<unit[^>]*meter="([^"]+)"/.exec(text)?.[1]) || 1;
  const yOben = /<up_axis>\s*Y_UP\s*<\/up_axis>/.test(text);
  const box = leer();
  // the sources that the <vertices> POSITION inputs name
  const positionen = new Set([...text.matchAll(/<vertices[^>]*>[\s\S]*?<input[^>]*semantic="POSITION"[^>]*source="#([^"]+)"/g)].map((m) => m[1]));
  for (const m of text.matchAll(/<source[^>]*id="([^"]+)"[^>]*>\s*<float_array[^>]*>([^<]*)<\/float_array>/g)) {
    if (positionen.size && !positionen.has(m[1])) continue;
    const z = m[2].trim().split(/\s+/).map(Number);
    for (let i = 0; i + 2 < z.length; i += 3) {
      const p = [z[i] * meter, z[i + 1] * meter, z[i + 2] * meter];
      dazu(box, yOben ? [p[0], -p[2], p[1]] : p);
    }
  }
  return box;
}

/* ---------------- sources ---------------- */

const zahlen = (s) => String(s ?? '').trim().split(/\s+/).map(Number);
async function holen(url, opts = {}) {
  const res = await politeFetch(url, { timeout: 60000, ...opts });
  if (res.status >= 500 || res.status === 429) { await res.body?.cancel().catch(() => {}); throw Object.assign(new Error(`HTTP ${res.status}`), { voruebergehend: true }); }
  if (!res.ok && res.status !== 206) { await res.body?.cancel().catch(() => {}); throw new Error(`HTTP ${res.status}`); }
  const groesse = Number(res.headers.get('content-length'));
  if (groesse > MAX_MESH) { await res.body?.cancel().catch(() => {}); throw new Error(`Datei zu groß (${Math.round(groesse / 1e6)} MB)`); }
  return res;
}

async function gltfVon(url) {
  if (/\.gltf(\?|$)/i.test(url)) return (await holen(url)).json();
  let bytes = await (await holen(url, { headers: { Range: 'bytes=0-1048575' } })).arrayBuffer();
  let j = glbJson(bytes);
  if (j.fehlt) j = glbJson(await (await holen(url, { headers: { Range: `bytes=0-${j.fehlt - 1}` } })).arrayBuffer());
  return j;
}

/** Khronos: glTF Y up → width x, depth z, height y. */
async function khronos(it) {
  const d = it.downloads.find((x) => x.format === 'glb') ?? it.downloads.find((x) => /\.gltf(\?|$)/i.test(x.url));
  if (!d) throw new Error('keine glTF-Datei');
  const a = ausdehnung(gltfBox(await gltfVon(d.url)));
  if (!a) throw new Error('keine Positionen');
  return { b: a[0], t: a[2], h: a[1] };
}

/** Box of one mesh file at Fuel, in the file's own units and axes (Z up after Collada's correction). */
async function meshBox(url) {
  const endung = /\.([a-z0-9]+)(?:\?|$)/i.exec(url)?.[1]?.toLowerCase();
  if (endung === 'obj') return objBox(await (await holen(url)).text());
  if (endung === 'dae') return daeBox(await (await holen(url)).text());
  if (endung === 'stl') return stlBox(await (await holen(url)).arrayBuffer());
  if (endung === 'glb' || endung === 'gltf') {
    // glTF inside a Gazebo model: Y up like any glTF; turn to Z up
    const b = gltfBox(await gltfVon(url));
    return Number.isFinite(b.min[0]) ? { min: [b.min[0], -b.max[2], b.min[1]], max: [b.max[0], -b.min[2], b.max[1]] } : b;
  }
  throw new Error(`Format ${endung ?? '?'} nicht lesbar`);
}

const POSE = (block) => zahlen(/<pose[^>]*>([^<]+)<\/pose>/.exec(block)?.[1]).slice(0, 3);
const verschoben = (box, d) => (Number.isFinite(box.min[0]) && d.length === 3 && d.every(Number.isFinite) ? { min: box.min.map((v, i) => v + d[i]), max: box.max.map((v, i) => v + d[i]) } : box);

/** Fuel: the visuals of model.sdf (mesh files, boxes, cylinders, spheres), in metres, Z up. */
async function fuel(it) {
  const basis = it.downloads[0].url.replace(/\.zip(\?.*)?$/, '');
  const sdf = await (await holen(`${basis}/tip/files/model.sdf`)).text();
  const box = leer();
  const meshes = new Map();
  for (const link of sdf.match(/<link[\s\S]*?<\/link>/g) ?? [sdf]) {
    const linkPose = POSE(link.replace(/<visual[\s\S]*?<\/visual>|<collision[\s\S]*?<\/collision>|<inertial[\s\S]*?<\/inertial>|<sensor[\s\S]*?<\/sensor>/g, ''));
    for (const visual of link.match(/<visual[\s\S]*?<\/visual>/g) ?? []) {
      const pose = POSE(visual.replace(/<geometry[\s\S]*?<\/geometry>/, ''));
      const versatz = [0, 1, 2].map((i) => (linkPose[i] || 0) + (pose[i] || 0));
      const geo = /<geometry>([\s\S]*?)<\/geometry>/.exec(visual)?.[1] ?? '';
      let teil = leer();
      const kasten = /<box>\s*<size>([^<]+)<\/size>/.exec(geo);
      const zylinder = /<cylinder>([\s\S]*?)<\/cylinder>/.exec(geo);
      const kugel = /<sphere>\s*<radius>([^<]+)<\/radius>/.exec(geo);
      const mesh = /<mesh>([\s\S]*?)<\/mesh>/.exec(geo);
      if (kasten) { const s = zahlen(kasten[1]); teil = { min: s.map((v) => -v / 2), max: s.map((v) => v / 2) }; }
      else if (zylinder) { const r = Number(/<radius>([^<]+)/.exec(zylinder[1])?.[1]); const l = Number(/<length>([^<]+)/.exec(zylinder[1])?.[1]); teil = { min: [-r, -r, -l / 2], max: [r, r, l / 2] }; }
      else if (kugel) { const r = Number(kugel[1]); teil = { min: [-r, -r, -r], max: [r, r, r] }; }
      else if (mesh) {
        const uri = /<uri>([^<]+)<\/uri>/.exec(mesh[1])?.[1]?.trim();
        if (!uri) continue;
        const pfad = uri.startsWith('http') ? null : uri.replace(/^model:\/\/[^/]+\//, '').replace(/^\.?\//, '');
        const url = uri.startsWith('http') ? uri : `${basis}/tip/files/${pfad.split('/').map(encodeURIComponent).join('/')}`;
        if (!meshes.has(url)) meshes.set(url, await meshBox(url));
        const s = zahlen(/<scale>([^<]+)<\/scale>/.exec(mesh[1])?.[1]);
        const m = meshes.get(url);
        teil = s.length === 3 && s.every(Number.isFinite) ? { min: m.min.map((v, i) => Math.min(v * s[i], m.max[i] * s[i])), max: m.max.map((v, i) => Math.max(v * s[i], m.min[i] * s[i])) } : m;
      }
      vereint(box, verschoben(teil, versatz));
    }
  }
  const a = ausdehnung(box);
  if (!a) throw new Error('keine sichtbare Geometrie in model.sdf');
  return { b: a[0], t: a[1], h: a[2] };
}

const MESSEN = { khronos, fuel };
// outside this the file is in other units or not to scale (Khronos' duck is 165 m without its node scale)
// Khronos' real objects (chairs, sofas, a fridge, lamps) are to scale and below 3 m; above 10 m are test scenes (Fox 155 m)
const GRENZE = { khronos: 10, fuel: 500 };
export const plausibel = (m, quelle) => [m.b, m.t, m.h].every((v) => Number.isFinite(v) && v >= 0) && Math.max(m.b, m.t, m.h) >= 0.001 && Math.max(m.b, m.t, m.h) <= (GRENZE[quelle] ?? 500);

/* ---------------- run ---------------- */

async function main() {
  const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
  const ende = Date.now() + (Number(arg('--max-minuten')) || 30) * 60000;
  const quellen = arg('--quelle')?.split(',') ?? QUELLEN;
  setHostGap('fuel.gazebosim.org', 1500);
  setHostGap('raw.githubusercontent.com', 400);
  const register = await ladeMasse();
  const { items } = await ladeKatalog(quellen);
  const heute = new Date().toISOString().slice(0, 10);
  const alt = (tag) => (Date.parse(heute) - Date.parse(tag)) / 864e5 >= NOCHMAL_TAGE;
  const offen = items.filter((it) => it.kind === '3d' && MESSEN[it.source.id] && (!register[it.id] || (register[it.id].fehler && alt(register[it.id].am))));
  console.log(`Maße: ${offen.length} Modelle offen (${quellen.join(', ')})`);
  let gut = 0, schlecht = 0, n = 0;
  for (const it of offen) {
    if (Date.now() > ende) break;
    try {
      const m = await MESSEN[it.source.id](it);
      const r = (v) => Math.round(v * 10000) / 10000;
      if (plausibel(m, it.source.id)) { register[it.id] = { b: r(m.b), t: r(m.t), h: r(m.h), am: heute }; gut++; }
      else { register[it.id] = { fehler: `unplausibel: ${[m.b, m.t, m.h].map((v) => v.toPrecision(3)).join(' × ')}`, am: heute }; schlecht++; }
    } catch (err) {
      if (!err.voruebergehend) { register[it.id] = { fehler: String(err.message).slice(0, 120), am: heute }; schlecht++; }
    }
    if (++n % 25 === 0) { await writeFile(DATEI, JSON.stringify(register)); console.log(`  ${n} von ${offen.length}: ${gut} gemessen, ${schlecht} ohne Ergebnis`); }
  }
  await writeFile(DATEI, JSON.stringify(register));
  console.log(`Fertig: ${gut} gemessen, ${schlecht} ohne Ergebnis, ${offen.length - n} bleiben für den nächsten Lauf.`);
}

if (process.argv[1]?.endsWith('masse.mjs')) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
