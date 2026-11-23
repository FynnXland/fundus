// 3D preview with three.js, loaded only when a model card is opened. Renders on demand (no animation loop).
//
// A source is { teile: [{ url, format, pose?, scale? }], dateien?, zHoch? }:
// - teile: one or more mesh files (glTF/GLB, STL, OBJ, DAE, PLY). Several parts come from a Gazebo model,
//   each placed by its pose from the SDF file (x y z roll pitch yaw, metres and radians, Z up).
// - dateien: file name or relative path -> real URL. Poly Haven's glTF and Gazebo's OBJ/DAE reference their
//   textures by relative paths; a URL modifier maps each one to the real file.
// - zHoch: the model uses Z as up axis (Gazebo, most STL from 3D printing); it is turned upright at the end.
// The camera always frames the whole model, whatever the window's shape.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const FORMATE = ['glb', 'gltf', 'dae', 'obj', 'stl', 'ply'];

const neutral = () => new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.65, metalness: 0.05 });

function urlManager(dateien) {
  const manager = new THREE.LoadingManager();
  const namen = new Map(Object.entries(dateien ?? {}).map(([k, v]) => [k.split('/').pop().toLowerCase(), v]));
  manager.setURLModifier((u) => {
    if (!dateien) return u;
    let rel;
    try { rel = decodeURIComponent(new URL(u, location.href).pathname); } catch { rel = u; }
    for (const [k, v] of Object.entries(dateien)) if (rel.endsWith(`/${k}`) || rel === k) return v;
    // textures named without their folder ("Hybrid.png" while the file lies in materials/textures/)
    return namen.get(rel.split('/').pop().toLowerCase()) ?? u;
  });
  return manager;
}

async function teilLaden(teil, manager) {
  const f = teil.format;
  if (f === 'glb' || f === 'gltf') {
    const l = new GLTFLoader(manager);
    l.setCrossOrigin('anonymous');
    return (await l.loadAsync(teil.url)).scene;
  }
  if (f === 'stl' || f === 'ply') {
    const geo = await (f === 'stl' ? new STLLoader(manager) : new PLYLoader(manager)).loadAsync(teil.url);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const mat = geo.attributes.color ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }) : neutral();
    return new THREE.Mesh(geo, mat);
  }
  if (f === 'obj') {
    const obj = new OBJLoader(manager);
    if (teil.mtl) {
      const mtl = await new MTLLoader(manager).setCrossOrigin('anonymous').loadAsync(teil.mtl).catch(() => null);
      if (mtl) { mtl.preload(); obj.setMaterials(mtl); }
    }
    const g = await obj.loadAsync(teil.url);
    if (!teil.mtl) g.traverse((o) => { if (o.isMesh) o.material = neutral(); });
    return g;
  }
  if (f === 'dae') {
    const dae = await new ColladaLoader(manager).loadAsync(teil.url);
    const s = dae.scene;
    // Gazebo works in Z up: a Z_UP file stays as it is, a Y_UP file is turned to Z up (as Gazebo does)
    if (teil.zHochWelt) s.rotation.set(Math.abs(s.rotation.x + Math.PI / 2) < 1e-6 ? 0 : Math.PI / 2, 0, 0);
    return s;
  }
  throw new Error(`Format ${f} wird nicht angezeigt`);
}

/** Pose "x y z roll pitch yaw" (SDF, fixed axes X, Y, Z) applied to an object. */
function poseSetzen(o, pose) {
  if (!pose) return;
  const [x = 0, y = 0, z = 0, r = 0, p = 0, w = 0] = pose;
  o.position.set(x, y, z);
  o.rotation.set(r, p, w, 'ZYX');
}

export async function modellZeigen(ziel, quelle, beschriftung) {
  // older call: (ziel, url, dateien, beschriftung) for a single glTF
  if (typeof quelle === 'string') {
    const [url, dateien, b] = [quelle, beschriftung, arguments[3]];
    quelle = { teile: [{ url, format: url.split('?')[0].split('.').pop().toLowerCase() }], dateien };
    beschriftung = b;
  }
  const manager = urlManager(quelle.dateien);
  const modell = new THREE.Group();
  const ergebnisse = await Promise.allSettled(quelle.teile.map(async (t) => {
    const o = await teilLaden({ ...t, zHochWelt: quelle.zHoch }, manager);
    const huelle = new THREE.Group();
    huelle.add(o);
    if (t.scale) o.scale.multiply(new THREE.Vector3(...t.scale));
    poseSetzen(huelle, t.pose);
    return huelle;
  }));
  const geladen = ergebnisse.filter((e) => e.status === 'fulfilled').map((e) => e.value);
  if (!geladen.length) throw ergebnisse[0]?.reason ?? new Error('Kein Teil geladen');
  modell.add(...geladen);
  if (quelle.zHoch) modell.rotation.x = -Math.PI / 2;

  const huelle = document.createElement('div');
  huelle.className = 'modell';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${beschriftung}. Mit der Maus ziehen zum Drehen, Mausrad zum Zoomen.`);
  canvas.tabIndex = 0;
  huelle.append(canvas);
  const steuer = document.createElement('div');
  steuer.className = 'modell__steuer';
  steuer.innerHTML = '<button type="button" class="knopf" data-dreh="-1">Nach links drehen</button><button type="button" class="knopf" data-dreh="1">Nach rechts drehen</button><button type="button" class="knopf" data-ganz>Ganz zeigen</button>';
  huelle.append(steuer);
  ziel.replaceChildren(huelle);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(modell);

  // frame the bounding sphere so the whole model fits, in the narrower of the two view angles
  modell.updateMatrixWorld(true);
  const quader = new THREE.Box3().setFromObject(modell);
  const kugel = quader.getBoundingSphere(new THREE.Sphere());
  const radius = kugel.radius > 0 ? kugel.radius : 1;
  const richtung = new THREE.Vector3(0.6, 0.35, 0.8).normalize();
  const camera = new THREE.PerspectiveCamera(40, 1, radius / 200, radius * 200);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(kugel.center);
  controls.enableDamping = false;
  controls.maxDistance = radius * 50;

  // distance at which all eight corners of the box fit the view from this direction (tighter than the sphere
  // for long or flat models), with a small margin
  const einpassen = (blick = richtung) => {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * camera.aspect;
    const vorn = blick.clone().normalize();
    const rechts = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), vorn).normalize();
    if (rechts.lengthSq() < 1e-6) rechts.set(1, 0, 0);
    const oben = new THREE.Vector3().crossVectors(vorn, rechts);
    let abstand = 0;
    for (let i = 0; i < 8; i++) {
      const ecke = new THREE.Vector3(i & 1 ? quader.max.x : quader.min.x, i & 2 ? quader.max.y : quader.min.y, i & 4 ? quader.max.z : quader.min.z).sub(kugel.center);
      const z = ecke.dot(vorn);
      abstand = Math.max(abstand, z + Math.abs(ecke.dot(rechts)) / tanH, z + Math.abs(ecke.dot(oben)) / tanV);
    }
    abstand = (abstand > 0 ? abstand : radius * 2) * 1.1;
    camera.position.copy(kugel.center).add(blick.clone().multiplyScalar(abstand));
    controls.target.copy(kugel.center);
    controls.update();
  };

  const zeichnen = () => renderer.render(scene, camera);
  let erstesMal = true;
  const groesse = () => {
    const w = huelle.clientWidth || 400;
    const h = Math.max(300, Math.min(520, w * 0.8));
    renderer.setSize(w, h, false);
    canvas.style.width = '100%';
    canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (erstesMal) { einpassen(); erstesMal = false; }
    zeichnen();
  };
  controls.addEventListener('change', zeichnen);
  const beobachter = new ResizeObserver(groesse);
  beobachter.observe(huelle);
  groesse();

  const drehen = (richtungZeichen) => {
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), (richtungZeichen * Math.PI) / 6);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  };
  steuer.addEventListener('click', (e) => {
    const k = e.target.closest('[data-dreh]');
    if (k) drehen(Number(k.dataset.dreh));
    if (e.target.closest('[data-ganz]')) { einpassen(camera.position.clone().sub(controls.target).normalize()); }
  });
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { drehen(-1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { drehen(1); e.preventDefault(); }
  });

  return () => {
    beobachter.disconnect();
    controls.dispose();
    pmrem.dispose();
    scene.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
        m.dispose();
      }
    });
    renderer.dispose();
  };
}

/* ---------------- Gazebo Fuel ---------------- */
// A Fuel model is a folder: model.sdf names the visual meshes with their poses, the meshes and textures lie
// beside it. The file list comes from the Fuel API (CORS open), each file can be fetched on its own.

const dateiAus = (baum, liste = []) => {
  for (const k of baum ?? []) (k.children ? dateiAus(k.children, liste) : liste.push(k.path));
  return liste;
};

const zahlen = (s) => (s ?? '').trim().split(/\s+/).filter(Boolean).map(Number);

/** Visual meshes from an SDF text: [{ pfad, pose, scale }]; link pose and visual pose are combined. */
export function sdfTeile(sdf) {
  const teile = [];
  const doc = new DOMParser().parseFromString(sdf, 'application/xml');
  for (const link of doc.querySelectorAll('link')) {
    const linkPose = zahlen([...link.children].find((c) => c.tagName === 'pose')?.textContent);
    for (const vis of [...link.children].filter((c) => c.tagName === 'visual')) {
      const uri = vis.querySelector('geometry > mesh > uri')?.textContent?.trim();
      if (!uri) continue;
      const visPose = zahlen([...vis.children].find((c) => c.tagName === 'pose')?.textContent);
      const scale = zahlen(vis.querySelector('geometry > mesh > scale')?.textContent);
      // <submesh> picks one named part of a shared file; such files are loaded once, whole, in model coordinates
      const submesh = Boolean(vis.querySelector('geometry > mesh > submesh'));
      teile.push({ pfad: uri.replace(/^model:\/\/[^/]+\//, '').replace(/^\.?\//, ''), linkPose, visPose, submesh, scale: scale.length === 3 ? scale : undefined });
    }
  }
  return teile;
}

function poseVerbinden(a, b) {
  if (!a?.length) return b?.length ? b : undefined;
  if (!b?.length) return a;
  const m = (p) => new THREE.Matrix4().compose(new THREE.Vector3(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(p[3] ?? 0, p[4] ?? 0, p[5] ?? 0, 'ZYX')), new THREE.Vector3(1, 1, 1));
  const ges = m(a).multiply(m(b));
  const pos = new THREE.Vector3(); const q = new THREE.Quaternion(); const s = new THREE.Vector3();
  ges.decompose(pos, q, s);
  const e = new THREE.Euler().setFromQuaternion(q, 'ZYX');
  return [pos.x, pos.y, pos.z, e.x, e.y, e.z];
}

/** Builds the source for modellZeigen from a Fuel model page address. */
export async function fuelQuelle(basis) {
  const antwort = await fetch(`${basis}/tip/files`, { referrerPolicy: 'no-referrer' });
  if (!antwort.ok) throw new Error(`Fuel ${antwort.status}`);
  const pfade = dateiAus((await antwort.json()).file_tree).map((p) => p.replace(/^\//, ''));
  const url = (p) => `${basis}/tip/files/${p.split('/').map(encodeURIComponent).join('/')}`;
  const dateien = Object.fromEntries(pfade.map((p) => [p, url(p)]));
  const endung = (p) => p.split('.').pop().toLowerCase();
  const mtlFuer = (p) => pfade.find((x) => x.toLowerCase() === p.toLowerCase().replace(/\.obj$/, '.mtl')) ?? pfade.find((x) => endung(x) === 'mtl' && x.split('/').slice(0, -1).join('/') === p.split('/').slice(0, -1).join('/'));

  let teile = [];
  const sdfPfad = pfade.find((p) => p === 'model.sdf') ?? pfade.find((p) => endung(p) === 'sdf');
  if (sdfPfad) {
    try {
      const sdf = await (await fetch(url(sdfPfad), { referrerPolicy: 'no-referrer' })).text();
      teile = sdfTeile(sdf)
        .map((t) => ({ ...t, pfad: pfade.find((p) => p.toLowerCase() === t.pfad.toLowerCase()) ?? pfade.find((p) => p.toLowerCase().endsWith(`/${t.pfad.split('/').pop().toLowerCase()}`)) }))
        .filter((t) => t.pfad && FORMATE.includes(endung(t.pfad)))
        .filter((t, i, alle) => {
          const gleiche = alle.filter((x) => x.pfad === t.pfad);
          if (!gleiche.some((x) => x.submesh)) return true;
          // a split file: keep one entry, without pose (the parts already sit in place inside the file)
          if (gleiche[0] !== t) return false;
          t.linkPose = undefined; t.visPose = undefined;
          return true;
        })
        .slice(0, 24)
        .map((t) => ({ url: url(t.pfad), format: endung(t.pfad), pose: poseVerbinden(t.linkPose, t.visPose), scale: t.scale, mtl: endung(t.pfad) === 'obj' && mtlFuer(t.pfad) ? url(mtlFuer(t.pfad)) : undefined }));
    } catch { teile = []; }
  }
  if (!teile.length) {
    // no usable SDF: the best mesh of the folder, collision meshes left out
    const kandidaten = pfade.filter((p) => FORMATE.includes(endung(p)) && !/collision|_col\b|\/col\//i.test(p));
    kandidaten.sort((a, b) => FORMATE.indexOf(endung(a)) - FORMATE.indexOf(endung(b)));
    if (kandidaten[0]) teile = [{ url: url(kandidaten[0]), format: endung(kandidaten[0]), mtl: endung(kandidaten[0]) === 'obj' && mtlFuer(kandidaten[0]) ? url(mtlFuer(kandidaten[0])) : undefined }];
  }
  if (!teile.length) throw new Error('Kein darstellbares Mesh im Fuel-Modell');
  return { teile, dateien, zHoch: true };
}
