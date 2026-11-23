// Khronos glTF Sample Assets (checked 23.11.2026, github.com/KhronosGroup/glTF-Sample-Assets):
// - Each model has Models/<Name>/metadata.json with a `legal` list (SPDX id, artist, owner). Of 153 models, 113 carry
//   only CC0-1.0, CC-BY-4.0 or CC-BY-SA-4.0 entries. A model with ANY other entry (CC-BY-NC in DamagedHelmet,
//   LicenseRef-LegalMark-* for logos, LicenseRef-Poser-EULA, SCEA, CRYENGINE) is dropped, not partly accepted.
// - Files come from raw.githubusercontent.com (200, Access-Control-Allow-Origin: *, same for bot and browser UA,
//   no referer check; robots.txt of the host has no rules). The tree comes from one api.github.com call
//   (GITHUB_TOKEN is used when set; unauthenticated 60 requests per hour is enough for one call).
// - The site's viewer has GLTFLoader only (no Draco, Meshopt, KTX2 decoders, no STL/OBJ). A model is previewed in 3D
//   only if its .glb is at most 15 MB, no decoder-bound extension is used and every extension it uses is known to
//   the loader (checked against the .gltf JSON); everything else shows the repository's screenshot.
// - Relative files of a .gltf (bin, textures) sit next to it, so the viewer needs no `dateien` map here.
import { getJson, politeFetch, setHostGap } from '../lib/http.mjs';
import { makeItem } from '../lib/item.mjs';

const REPO = 'KhronosGroup/glTF-Sample-Assets';
const RAW = `https://raw.githubusercontent.com/${REPO}/main/Models/`;
const SITE = `https://github.com/${REPO}/tree/main/Models/`;
const TREE_URL = `https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`;
const INDEX_URL = `${RAW}model-index.json`;
const MAX_PREVIEW_BYTES = 15e6;

const source = {
  id: 'khronos',
  code: 'C8',
  name: 'Khronos glTF Sample Assets',
  url: `https://github.com/${REPO}`,
  kinds: ['3d'],
  terms: `https://github.com/${REPO}/blob/main/README.md`,
};

// SPDX id of an entry in metadata.json `legal` → licence code for makeItem. Nothing else passes.
const LEGAL = { 'CC0-1.0': 'cc0', 'CC-BY-4.0': 'by', 'CC-BY-SA-4.0': 'by-sa' };
const STRENGTH = { cc0: 0, by: 1, 'by-sa': 2 };

// Extensions GLTFLoader of the bundled three.js reads (examples/jsm/loaders/GLTFLoader.js, checked 0.187.0) without
// a decoder, plus metadata-only ones that change nothing visually.
const LOADER_OK = new Set([
  'KHR_lights_punctual', 'KHR_materials_anisotropy', 'KHR_materials_clearcoat', 'KHR_materials_diffuse_roughness',
  'KHR_materials_dispersion', 'KHR_materials_emissive_strength', 'KHR_materials_ior', 'KHR_materials_iridescence',
  'KHR_materials_sheen', 'KHR_materials_specular', 'KHR_materials_transmission', 'KHR_materials_unlit',
  'KHR_materials_volume', 'KHR_mesh_quantization', 'KHR_texture_transform', 'EXT_texture_webp', 'EXT_texture_avif',
  'EXT_materials_bump', 'EXT_mesh_gpu_instancing', 'KHR_materials_variants', 'KHR_xmp_json_ld', 'KHR_xmp',
]);

/** Licence code for all `legal` entries of a model, or null if even one entry is not on the whitelist. */
export function licenseOf(legal) {
  if (!Array.isArray(legal) || !legal.length) return null;
  let worst = 'cc0';
  for (const l of legal) {
    const code = LEGAL[l?.spdx ?? l?.license];
    if (!code) return null;
    if (STRENGTH[code] > STRENGTH[worst]) worst = code;
  }
  return worst;
}

/** True when the 3D viewer can show this glTF (see header). `gltf` = { extensionsUsed?, extensionsRequired? } or null. */
export function viewerCanShow(gltf) {
  if (!gltf) return false;
  return [...(gltf.extensionsUsed ?? []), ...(gltf.extensionsRequired ?? [])].every((e) => LOADER_OK.has(e));
}

const enc = (path) => path.split('/').map(encodeURIComponent).join('/');

/** Sizes by repository path from a git tree (`[{path, size}]`). */
export function sizesFromTree(tree) {
  return new Map((tree ?? []).filter((t) => t && typeof t.size === 'number').map((t) => [t.path, t.size]));
}

/**
 * @param {object} entry  model-index.json entry ({name, label, screenshot, tags, variants})
 * @param {object} meta   Models/<name>/metadata.json
 * @param {Map<string, number>} sizes  repository path → bytes (sizesFromTree)
 * @param {object|null} gltf  { extensionsUsed, extensionsRequired } of the .gltf variant, null if unknown
 */
export function parseModel(entry, meta, sizes, gltf) {
  if (!entry?.name || !meta) return null;
  const license = licenseOf(meta.legal);
  if (!license) return null;
  const name = entry.name;
  const dir = `Models/${name}`;
  const url = (p) => `${RAW}${enc(`${name}/${p}`)}`;

  const downloads = [];
  const glbName = entry.variants?.['glTF-Binary'];
  const glbSize = glbName ? sizes.get(`${dir}/glTF-Binary/${glbName}`) : undefined;
  if (glbName) downloads.push({ label: 'glTF Binary (.glb)', url: url(`glTF-Binary/${glbName}`), format: 'glb', size: glbSize });
  const embedded = entry.variants?.['glTF-Embedded'];
  if (embedded) downloads.push({ label: 'glTF mit eingebetteten Daten (.gltf)', url: url(`glTF-Embedded/${embedded}`), format: 'gltf', size: sizes.get(`${dir}/glTF-Embedded/${embedded}`) });
  const gltfName = entry.variants?.glTF;
  const files = [];
  let pkgSize = 0;
  for (const [path, size] of sizes) {
    if (!path.startsWith(`${dir}/glTF/`)) continue;
    const rel = path.slice(`${dir}/glTF/`.length);
    files.push({ path: rel, url: url(`glTF/${rel}`) });
    pkgSize += size;
  }
  files.sort((a, b) => (b.path === gltfName) - (a.path === gltfName) || a.path.localeCompare(b.path));
  if (gltfName && files.length > 1) {
    downloads.push({ label: 'glTF-Paket (Einzeldateien)', url: files[0].url, format: 'zip', size: pkgSize, paket: { name: `${name.replace(/\s+/g, '-')}_gltf`, files, size: pkgSize } });
  } else if (gltfName && files.length === 1) {
    downloads.push({ label: 'glTF (.gltf)', url: files[0].url, format: 'gltf', size: pkgSize });
  }
  if (!downloads.length) return null;

  const shot = entry.screenshot ? url(entry.screenshot) : undefined;
  let preview;
  if (glbName && glbSize && glbSize <= MAX_PREVIEW_BYTES && viewerCanShow(gltf)) {
    preview = { type: 'model', url: url(`glTF-Binary/${glbName}`), thumb: shot };
  } else if (shot) {
    preview = { type: 'image', thumb: shot, url: shot };
  } else {
    return null;
  }

  const artists = [...new Set((meta.legal ?? []).map((l) => String(l.artist ?? l.owner ?? '').replace(/\s*\(https?:[^)]*\)\s*$/, '').trim()).filter(Boolean))];
  const noise = new Set(['core', 'testing', 'showcase', 'video', 'extension', 'issues', 'test']);
  const tags = ['gltf', ...(entry.tags ?? []).filter((t) => typeof t === 'string' && !noise.has(t))];
  return makeItem(source, {
    sourceId: name,
    kind: '3d',
    title: entry.label || meta.name || name,
    description: typeof meta.summary === 'string' && meta.summary.trim() ? meta.summary.trim() : undefined,
    tags,
    creator: { name: artists.join(', ') || 'unbekannt' },
    landing: `${SITE}${encodeURIComponent(name)}`,
    license,
    preview,
    downloads,
  });
}

source.crawl = async function crawl(cfg = {}, log = () => {}) {
  setHostGap('raw.githubusercontent.com', Number(cfg.abstandMs) || 400);
  const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  let tree;
  try {
    const data = await getJson(TREE_URL, { headers });
    if (data.truncated) log('  khronos: Dateibaum abgeschnitten, Größen können fehlen');
    tree = data.tree;
  } catch (err) {
    log(`  khronos: Dateibaum nicht lesbar (${err.message}), Quelle übersprungen`);
    return [];
  }
  const sizes = sizesFromTree(tree);
  let index;
  try {
    index = await getJson(INDEX_URL);
  } catch (err) {
    log(`  khronos: model-index.json nicht lesbar (${err.message})`);
    return [];
  }
  const out = [];
  let dropped = 0;
  for (const entry of Array.isArray(index) ? index : []) {
    try {
      const meta = await getJson(`${RAW}${enc(`${entry.name}/metadata.json`)}`);
      if (!licenseOf(meta.legal)) {
        dropped++;
        continue;
      }
      let gltf = null;
      if (entry.variants?.glTF) {
        const res = await politeFetch(`${RAW}${enc(`${entry.name}/glTF/${entry.variants.glTF}`)}`);
        if (res.ok) {
          const g = await res.json().catch(() => null);
          if (g) gltf = { extensionsUsed: g.extensionsUsed, extensionsRequired: g.extensionsRequired };
        } else {
          await res.body?.cancel().catch(() => {});
        }
      }
      const it = parseModel(entry, meta, sizes, gltf);
      if (it) out.push(it);
      else dropped++;
    } catch (err) {
      log(`  khronos ${entry.name}: ${err.message}`);
    }
  }
  log(`  khronos: ${out.length} Modelle, ${dropped} wegen Lizenz oder fehlender Dateien verworfen`);
  return out;
};

export default source;
