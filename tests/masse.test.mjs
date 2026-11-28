// Sizes read from model files (crawler/masse.mjs) and how they reach the site and the MCP server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gltfBox, glbJson, objBox, stlBox, daeBox, plausibel } from '../crawler/masse.mjs';
import { gemesseneAbmessung } from '../crawler/publish.mjs';
import { detailtext } from '../mcp/src/werkzeuge.mjs';

const ausdehnung = (b) => b.max.map((v, i) => +(v - b.min[i]).toFixed(4));

test('glTF: Ausdehnung aus min/max der Accessoren, mit Knoten-Matrix, Skalierung und Drehung', () => {
  const j = {
    scene: 0,
    scenes: [{ nodes: [0] }],
    // a cube of 100 units scaled by a matrix to 1 m (the way Khronos' duck sets its size), with a child moved 2 m up
    nodes: [{ matrix: [0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 1], mesh: 0, children: [1] }, { translation: [0, 200, 0], mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ min: [-50, -50, -50], max: [50, 50, 50] }],
  };
  assert.deepEqual(ausdehnung(gltfBox(j)), [1, 3, 1]);
  // rotated 90° about Y: a box 2 wide and 1 deep becomes 1 wide and 2 deep
  const r = Math.SQRT1_2;
  const k = { scenes: [{ nodes: [0] }], nodes: [{ rotation: [0, r, 0, r], mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ min: [-1, 0, -0.5], max: [1, 1, 0.5] }] };
  assert.deepEqual(ausdehnung(gltfBox(k)), [1, 1, 2]);
});

test('glb: der JSON-Teil steht am Anfang; reicht der Ausschnitt nicht, sagt glbJson, wie viel fehlt', () => {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' } }).padEnd(28, ' '));
  const kopf = Buffer.alloc(20);
  kopf.write('glTF', 0, 'latin1'); kopf.writeUInt32LE(2, 4); kopf.writeUInt32LE(20 + json.length, 8); kopf.writeUInt32LE(json.length, 12); kopf.write('JSON', 16, 'latin1');
  const datei = Buffer.concat([kopf, json]);
  assert.equal(glbJson(datei).asset.version, '2.0');
  assert.deepEqual(glbJson(datei.subarray(0, 30)), { fehlt: 20 + json.length });
});

test('OBJ, STL und Collada: Ausdehnung der Eckpunkte, Collada mit Einheit und Y oben', () => {
  assert.deepEqual(ausdehnung(objBox('# x\nv 0 0 0\nvt 5 5\nv 0.4 0.5 0.6\nvn 9 9 9\n')), [0.4, 0.5, 0.6]);
  // binary STL with one triangle
  const stl = Buffer.alloc(84 + 50);
  stl.writeUInt32LE(1, 80);
  [[0, 0, 0], [10, 0, 0], [0, 20, 5]].forEach((p, v) => p.forEach((x, i) => stl.writeFloatLE(x, 84 + 12 + v * 12 + i * 4)));
  assert.deepEqual(ausdehnung(stlBox(stl)), [10, 20, 5]);
  assert.deepEqual(ausdehnung(stlBox(Buffer.from('solid a\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 2 3\nvertex 0 0 1\nendloop\nendfacet\nendsolid a'))), [1, 2, 3]);
  const dae = `<COLLADA><asset><unit meter="0.01"/><up_axis>Y_UP</up_axis></asset>
    <mesh><source id="pos"><float_array count="6">0 0 0 100 50 20</float_array></source><source id="nor"><float_array count="3">9 9 9</float_array></source>
    <vertices id="v"><input semantic="POSITION" source="#pos"/></vertices></mesh></COLLADA>`;
  // centimetres to metres, Y up turned to Z up: 1 m wide, 0.2 m deep, 0.5 m high
  assert.deepEqual(ausdehnung(daeBox(dae)), [1, 0.2, 0.5]);
});

test('Plausibel: Khronos über 10 m sind Testszenen, Fuel darf größer sein', () => {
  assert.equal(plausibel({ b: 0.8, t: 0.6, h: 0.7 }, 'khronos'), true);
  assert.equal(plausibel({ b: 25, t: 155, h: 79 }, 'khronos'), false);
  assert.equal(plausibel({ b: 64, t: 11, h: 1.5 }, 'fuel'), true);
  assert.equal(plausibel({ b: 1000, t: 1000, h: 0 }, 'fuel'), false);
  assert.equal(plausibel({ b: 0, t: 0, h: 0 }, 'fuel'), false);
});

test('Gemessene Maße: auf der Karte als gemessen gekennzeichnet, im MCP als grob', () => {
  const a = gemesseneAbmessung({ b: 0.478, t: 0.67, h: 0.607, am: '2026-11-28' });
  assert.equal(a, '0,48 × 0,67 × 0,61 m (B × T × H, aus der Datei gemessen)');
  assert.equal(gemesseneAbmessung({ fehler: 'HTTP 404', am: '2026-11-28' }), undefined);
  const it = {
    id: 'fuel:x/Toilet', title: 'Standard Toilet 1', kind: '3d', unter: 'Sonstiges', tags: [], creator: { name: 'x' },
    license: { name: 'CC BY 4.0', attribution: true }, source: { url: 'https://app.gazebosim.org/x', name: 'Gazebo Fuel' },
    meta: { abmessung: a }, preview: {}, downloads: [{ label: 'ZIP', url: 'https://fuel.gazebosim.org/x.zip', format: 'zip' }],
  };
  assert.match(detailtext(it), /^Size: 0\.48 × 0\.67 × 0\.61 m \(width × depth × height, measured by Fundus from the model file: rough/m);
});
