// Poly Haven: 3D models, textures and HDRIs, all CC0. The API is free for any purpose but asks for
// a unique User-Agent and a visible "Powered by Poly Haven" in the interface (polyhaven.com/our-api);
// the site shows it in the footer, on the sources page and on every Poly Haven card.
// Models consist of several files (glTF + bin + textures), so the downloads are "packages": the browser
// fetches each file from dl.polyhaven.org (CORS allowed) and zips them locally.
import { getJson, setHostGap } from '../lib/http.mjs';
import { makeItem } from '../lib/item.mjs';

const API = 'https://api.polyhaven.com';

const source = {
  id: 'polyhaven',
  code: 'PH',
  name: 'Poly Haven',
  url: 'https://polyhaven.com',
  kinds: ['3d', 'textur', 'hdri'],
  terms: 'https://polyhaven.com/our-api',
  hinweis: 'Powered by Poly Haven',
};

const TYPE = { 0: 'hdri', 1: 'textur', 2: 'modell' };

function packageFrom(name, entry) {
  if (!entry?.url) return null;
  const main = entry.url.split('/').pop();
  const files = [{ path: main, url: entry.url }];
  let size = entry.size ?? 0;
  for (const [path, inc] of Object.entries(entry.include ?? {})) {
    files.push({ path, url: inc.url });
    size += inc.size ?? 0;
  }
  return { name, files, size };
}

export function parseAsset(id, info, files) {
  const type = TYPE[info.type];
  if (!type) return null;
  const thumb = info.thumbnail_url?.replace(/width=\d+/, 'width=480');
  const res = (o, ...keys) => keys.map((k) => o?.[k]).find(Boolean);
  const downloads = [];
  let preview = { type: 'image', thumb };
  const meta = {};

  if (type === 'modell') {
    const gltf1k = res(files.gltf, '1k')?.gltf;
    const gltf2k = res(files.gltf, '2k')?.gltf;
    const blend = res(files.blend, '2k', '1k')?.blend;
    const fbx = res(files.fbx, '2k', '1k')?.fbx;
    for (const [label, entry, tag] of [['glTF-Paket (2K-Texturen)', gltf2k, 'gltf_2k'], ['Blender-Paket (.blend)', blend, 'blend'], ['FBX-Paket', fbx, 'fbx']]) {
      const pkg = packageFrom(`${id}_${tag}`, entry);
      if (pkg) downloads.push({ label, url: entry.url, format: 'zip', size: pkg.size, paket: pkg });
    }
    if (gltf1k?.url) {
      const map = Object.fromEntries(Object.entries(gltf1k.include ?? {}).map(([p, inc]) => [p, inc.url]));
      preview = { type: 'model', thumb, url: gltf1k.url, dateien: map };
    }
    if (info.polycount) meta.polygone = String(info.polycount);
  } else if (type === 'hdri') {
    for (const r of ['1k', '2k', '4k']) {
      const hdr = files.hdri?.[r]?.hdr;
      if (hdr) downloads.push({ label: `HDR ${r.toUpperCase()}`, url: hdr.url, format: 'hdr', size: hdr.size, md5: hdr.md5 });
    }
    const exr = files.hdri?.['2k']?.exr;
    if (exr) downloads.push({ label: 'EXR 2K', url: exr.url, format: 'exr', size: exr.size });
    if (files.tonemapped?.url) preview = { type: 'image', thumb, url: files.tonemapped.url };
  } else {
    const maps = ['Diffuse', 'nor_gl', 'Rough', 'AO', 'Displacement', 'arm'];
    for (const r of ['1k', '2k']) {
      const pkgFiles = [];
      let size = 0;
      for (const m of maps) {
        const f = files[m]?.[r]?.jpg ?? files[m]?.[r]?.png;
        if (f) {
          pkgFiles.push({ path: f.url.split('/').pop(), url: f.url });
          size += f.size ?? 0;
        }
      }
      if (pkgFiles.length) downloads.push({ label: `Material ${r.toUpperCase()} (JPG-Maps)`, url: pkgFiles[0].url, format: 'zip', size, paket: { name: `${id}_${r}`, files: pkgFiles, size } });
    }
    const diff = files.Diffuse?.['1k']?.jpg;
    if (diff) preview = { type: 'image', thumb, url: diff.url };
  }
  if (info.max_resolution) meta.aufloesung = `${info.max_resolution[0]} × ${info.max_resolution[1]} px`;

  return makeItem(source, {
    sourceId: id,
    kind: type === 'modell' ? '3d' : type === 'hdri' ? 'hdri' : 'textur',
    title: info.name,
    tags: [...(info.categories ?? []), ...(info.tags ?? [])],
    creator: { name: Object.keys(info.authors ?? {}).join(', ') || 'Poly Haven' },
    landing: `https://polyhaven.com/a/${id}`,
    license: 'CC0',
    preview,
    downloads,
    meta: { ...meta, art: type === 'hdri' ? 'HDRI' : type === 'textur' ? 'Textur' : '3D-Modell' },
    // MD5 of the main file as published by Poly Haven, for the duplicate check
    hashes: downloads[0]?.md5 ? { md5: downloads[0].md5 } : undefined,
  });
}

source.crawl = async function crawl(cfg, log) {
  setHostGap('api.polyhaven.com', 400);
  const out = [];
  for (const [t, limit] of [['models', cfg.models], ['textures', cfg.textures], ['hdris', cfg.hdris]]) {
    if (!limit) continue;
    let assets;
    try {
      assets = await getJson(`${API}/assets?t=${t}`);
    } catch (err) {
      log(`  polyhaven ${t}: ${err.message}`);
      continue;
    }
    const top = Object.entries(assets).sort((a, b) => (b[1].download_count ?? 0) - (a[1].download_count ?? 0)).slice(0, limit);
    for (const [id, info] of top) {
      try {
        const files = await getJson(`${API}/files/${encodeURIComponent(id)}`);
        const it = parseAsset(id, info, files);
        if (it) out.push(it);
      } catch (err) {
        log(`  polyhaven ${id}: ${err.message}`);
      }
    }
  }
  return out;
};

export default source;
