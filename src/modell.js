// 3D preview with three.js, loaded only when a model card is opened. Poly Haven's glTF files reference
// their textures by relative paths that do not exist on the CDN, so a URL modifier maps each relative
// path to the real file URL from the API. Renders on demand (no animation loop).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export async function modellZeigen(ziel, url, dateien, beschriftung) {
  const basis = url.slice(0, url.lastIndexOf('/') + 1);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((u) => {
    if (u.startsWith(basis)) {
      const rel = decodeURIComponent(u.slice(basis.length));
      if (dateien[rel]) return dateien[rel];
    }
    return u;
  });
  const loader = new GLTFLoader(manager);
  loader.setCrossOrigin('anonymous');
  const gltf = await loader.loadAsync(url);

  const huelle = document.createElement('div');
  huelle.className = 'modell';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${beschriftung}. Mit der Maus ziehen zum Drehen, Mausrad zum Zoomen.`);
  canvas.tabIndex = 0;
  huelle.append(canvas);
  const steuer = document.createElement('div');
  steuer.className = 'modell__steuer';
  steuer.innerHTML = '<button type="button" class="knopf" data-dreh="-1">Nach links drehen</button><button type="button" class="knopf" data-dreh="1">Nach rechts drehen</button>';
  huelle.append(steuer);
  ziel.replaceChildren(huelle);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(gltf.scene);

  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3()).length();
  const center = box.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(40, 1, size / 100, size * 10);
  camera.position.copy(center).add(new THREE.Vector3(0.6, 0.35, 0.8).normalize().multiplyScalar(size * 1.1));
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(center);
  controls.enableDamping = false;
  controls.update();

  const zeichnen = () => renderer.render(scene, camera);
  const groesse = () => {
    const w = huelle.clientWidth || 400;
    const h = Math.max(300, Math.min(520, w * 0.8));
    renderer.setSize(w, h, false);
    canvas.style.width = '100%';
    canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    zeichnen();
  };
  controls.addEventListener('change', zeichnen);
  const beobachter = new ResizeObserver(groesse);
  beobachter.observe(huelle);
  groesse();

  const drehen = (richtung) => {
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), (richtung * Math.PI) / 6);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  };
  steuer.addEventListener('click', (e) => {
    const k = e.target.closest('[data-dreh]');
    if (k) drehen(Number(k.dataset.dreh));
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
