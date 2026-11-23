// Adapters for game assets and code extensions against trimmed real API responses (fetched 23.11.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateItem } from '../crawler/lib/schema.mjs';
import { parseListing, parseExtension } from '../crawler/sources/blender.mjs';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const valid = (it) => assert.deepEqual(validateItem(it), [], JSON.stringify(it, null, 1));

test('Blender: Add-ons und Themes als Skript, Plattform-ZIPs zusammengefasst, sha256 der Quelle', () => {
  const items = parseListing(fx('blender-extensions'));
  for (const it of items) valid(it);
  assert.deepEqual(items.map((i) => i.id), ['blender:universal_transform_gizmo', 'blender:carbon_fiber_black', 'blender:quick_n_panel', 'blender:id_renderflo']);
  const gizmo = items[0];
  assert.equal(gizmo.kind, 'skript');
  assert.equal(gizmo.license.id, 'GPL-3.0');
  assert.equal(gizmo.hashes.sha256, '8e5966cabaf64dc50b114abb9189acb952be99b252a945c7e9f4396508e35faa');
  assert.equal(gizmo.source.url, 'https://extensions.blender.org/add-ons/universal-transform-gizmo/');
  assert.equal(items[1].meta.art, 'Theme');
  // quick_n_panel lists GPL-3.0-or-later and CC0-1.0; both pass, the first is shown.
  assert.equal(items[2].license.id, 'GPL-3.0');
  assert.equal(items[3].downloads.length, 2);
  assert.match(items[3].downloads[0].label, /windows-x64/);
});

test('Blender: Asset-Bibliothek, Sperrliste und fremde Lizenz werden verworfen', () => {
  const { data } = fx('blender-extensions');
  const lib = data.filter((r) => r.id === 'alex_chamberlain');
  assert.equal(parseExtension(lib), null);
  const gizmo = data.filter((r) => r.id === 'universal_transform_gizmo');
  assert.equal(parseExtension(gizmo, new Set(['universal_transform_gizmo'])), null);
  assert.equal(parseExtension([{ ...gizmo[0], license: ['SPDX:GPL-3.0-or-later', 'SPDX:CC-BY-NC-4.0'] }]), null);
  assert.equal(parseExtension([{ ...gizmo[0], license: [] }]), null);
});
