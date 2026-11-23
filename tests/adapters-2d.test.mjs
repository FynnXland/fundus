// Adapters for game assets and code extensions against trimmed real API responses (fetched 23.11.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateItem } from '../crawler/lib/schema.mjs';
import { parseListing, parseExtension } from '../crawler/sources/blender.mjs';
import { parseAsset, licenseOf as godotLicense, planDetails, pictureAllowed } from '../crawler/sources/godot.mjs';
import { parseFeed as parseOga, parseEntry as parseOgaEntry, pickLicense } from '../crawler/sources/opengameart.mjs';
import { parseFeed as parseClipart, parseEntry as parseClipartEntry } from '../crawler/sources/openclipart.mjs';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const text = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
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

// ---------------------------------------------------------------------------------------------
// Godot Asset Library

test('Godot: Add-on wird Skript, Vorlage wird Projekt, Lizenzschreibweise auf SPDX umgeschrieben', () => {
  const [demo, template, addon] = fx('godot-assets').details.map(parseAsset);
  for (const it of [demo, template, addon]) valid(it);
  assert.equal(addon.id, 'godot:5538');
  assert.equal(addon.kind, 'skript');
  assert.equal(addon.license.id, 'GPL-3.0');
  assert.equal(addon.source.url, 'https://godotengine.org/asset-library/asset/5538');
  assert.equal(addon.downloads[0].url, 'https://github.com/JoenTNT/godot-detachable-inspector/archive/e9a31d81d64a7b541a40ff2e9b1ee830479b42ad.zip');
  assert.equal(demo.kind, 'projekt');
  assert.equal(template.license.id, 'CC0-1.0');
  assert.equal(addon.meta.godot, '4.7');
});

test('Godot: Bild nur von bekannten Hosts, sonst Textvorschau', () => {
  const [demo, template, addon] = fx('godot-assets').details.map(parseAsset);
  // raw.githubusercontent.com
  assert.equal(addon.preview.type, 'image');
  assert.match(addon.preview.thumb, /^https:\/\/raw\.githubusercontent\.com\//);
  // github.com/<owner>/<repo>/blob/...?raw=true is a stable repository file
  assert.equal(demo.preview.type, 'image');
  assert.match(demo.preview.thumb, /^https:\/\/github\.com\/CodeNameTwister\/.+icon\.png\?raw=true$/);
  // wikimedia icon and github user-attachments (expiring S3 link) are not taken: text preview
  assert.equal(template.preview.type, 'text');
  assert.equal(pictureAllowed('https://github.com/user-attachments/assets/e96f0b55-0593-45da-8cd1-3a9c38fc5de6'), false);
  assert.equal(pictureAllowed('https://i.imgur.com/abc.png'), false);
  assert.equal(pictureAllowed('http://raw.githubusercontent.com/a/b/main/x.png'), false);
  assert.equal(pictureAllowed('https://raw.githubusercontent.com/a/b/main/readme.md'), false);
  assert.equal(pictureAllowed('https://gitlab.com/a/b/-/raw/main/x.png'), true);
  assert.equal(pictureAllowed('https://gitlab.com/a/b/raw/master/x.png'), true);
  assert.equal(pictureAllowed('https://github.com/a/b/raw/main/x.jpg'), true);
  assert.equal(pictureAllowed('https://codeberg.org/a/b/media/branch/main/x.png'), true);
  assert.equal(pictureAllowed('https://codeberg.org/a/b/raw/commit/0123abc/x.png'), true);
  // these answer with an HTML page (curl-checked): github blob without raw=true, gitlab blob, avatars, src view
  assert.equal(pictureAllowed('https://github.com/a/b/blob/main/addons/x/icon.svg'), false);
  assert.equal(pictureAllowed('https://gitlab.com/a/b/blob/master/icon.png'), false);
  assert.equal(pictureAllowed('https://gitlab.com/a/b/-/blob/master/icon.png'), false);
  assert.equal(pictureAllowed('https://gitlab.com/uploads/-/system/project/avatar/1/x.png'), false);
  assert.equal(pictureAllowed('https://codeberg.org/a/b/src/branch/main/icon.png'), false);
  assert.equal(pictureAllowed('https://github.com/a/b/releases/download/v1/logo.png'), false);
});

test('Godot: Proprietary und LGPL 2.0 fallen raus, Detail wird gegengeprüft', () => {
  const { list, details } = fx('godot-assets');
  assert.equal(godotLicense('Proprietary'), null);
  assert.equal(godotLicense('LGPLv2'), null);
  assert.equal(godotLicense('LGPLv2.1').id, 'LGPL-2.1');
  assert.equal(godotLicense('AGPLv3').id, 'AGPL-3.0');
  assert.equal(godotLicense('CC-BY-SA-4.0').id, 'CC-BY-SA-4.0');
  assert.equal(godotLicense('Unlicense').id, 'Unlicense');
  // the listing check keeps the Proprietary asset (5585) from being fetched at all
  const plan = planDetails({ version: 1, gesehen: {} }, list.result, 10);
  assert.deepEqual(plan.todo.map((a) => a.asset_id), ['5588', '3328', '5538']);
  assert.equal(plan.skipped.lizenz, 1);
  assert.deepEqual(plan.skipped.lizenzen, { Proprietary: 1 });
  // a detail answer whose licence changed to Proprietary meanwhile is rejected too
  assert.equal(parseAsset({ ...details[2], cost: 'Proprietary' }), null);
  assert.equal(parseAsset({ ...details[2], type: 'theme' }), null);
  assert.equal(parseAsset({ ...details[2], download_url: '' }), null);
});

test('Godot: Etappen lesen nur Neues oder Geändertes, abgelehnte bleiben bis zur Änderung draußen', () => {
  const rows = fx('godot-assets').list.result;
  const state = { version: 1, gesehen: { 5588: '2026-11-06 01:47:31', 3328: 'aus:2025-11-03 18:32:54', 5538: '2026-01-01 00:00:00' } };
  const plan = planDetails(state, rows, 10);
  // 5588 and 3328 are known, 5538 changed since it was read
  assert.deepEqual(plan.todo.map((a) => a.asset_id), ['5538']);
  assert.equal(plan.skipped.bekannt, 2);
  // the budget caps the run; unseen assets come before changed ones
  const capped = planDetails({ version: 1, gesehen: { 5538: 'alt' } }, rows, 1);
  assert.deepEqual(capped.todo.map((a) => a.asset_id), ['5588']);
  assert.equal(capped.offen, 3);
  // the same asset twice in the listing is read once
  assert.equal(planDetails({ version: 1, gesehen: {} }, [...rows, rows[0]], 10).todo.length, 3);
});

// ---------------------------------------------------------------------------------------------
// OpenGameArt

test('OpenGameArt: Feed liefert Arten, freieste Lizenz, Audio- und Bildvorschau', () => {
  const { items, skipped } = parseOga(text('opengameart-feed.xml'));
  for (const it of items) valid(it);
  assert.equal(items.length, 5);
  assert.deepEqual(skipped, { art: {}, lizenz: 0, 'oga-by': 0, format: 0 });
  const byTitle = Object.fromEntries(items.map((i) => [i.title, i]));
  const windmill = byTitle['Windmill model'];
  assert.equal(windmill.kind, '3d');
  assert.equal(windmill.license.id, 'CC0-1.0');
  assert.equal(windmill.preview.type, 'image');
  assert.equal(windmill.downloads.length, 2);
  assert.equal(windmill.downloads[0].size, 17922693);
  assert.equal(windmill.source.url, 'https://opengameart.org/content/windmill-model');
  const sigh = byTitle.Sigh;
  assert.equal(sigh.kind, 'musik');
  assert.equal(sigh.preview.type, 'audio');
  assert.equal(sigh.preview.url, 'https://opengameart.org/sites/default/files/sigh.mp3');
  assert.equal(sigh.downloads[0].url, 'https://opengameart.org/sites/default/files/sigh_0.mp3');
  assert.equal(sigh.creator.name, 'purrplecat');
  assert.equal(byTitle['Journey Awaits rmx'].license.id, 'CC-BY-SA-3.0');
  assert.equal(byTitle['Controller Prompt Assets based on RetryElis 1bit controllers'].kind, 'grafik');
});

test('OpenGameArt: OGA-BY neben CC BY wird übergangen, OGA-BY allein aufgenommen', () => {
  const xml = text('opengameart-feed.xml');
  const { items } = parseOga(xml);
  // "Area (1) - Cinematic" offers OGA-BY 4.0 and CC-BY 4.0: the whitelisted one is taken
  assert.equal(items.find((i) => i.title.startsWith('Area (1)')).license.id, 'CC-BY-4.0');
  // an OGA-BY-only entry, made from the real one by renaming the CC BY offer
  const areaXml = xml.split('<item>').find((p) => p.includes('<title>Area (1)')).split('</item>')[0];
  const onlyOga = areaXml.replace(/CC-BY 4\.0/g, 'OGA-BY 4.0');
  assert.notEqual(onlyOga, areaXml);
  // OGA-BY is on the whitelist since 23.11.2026 (CC BY without the DRM clause)
  assert.equal(parseOgaEntry(onlyOga).item.license.id, 'OGA-BY-4.0');
  const feed = parseOga(`<rss><channel><item>${onlyOga}</item></channel></rss>`);
  assert.equal(feed.items.length, 1);
  assert.equal(feed.skipped['oga-by'], 0);
  // unknown art type and licences outside the whitelist
  assert.deepEqual(parseOgaEntry(areaXml.replace('&gt;Music&lt;', '&gt;Document&lt;')), { item: null, grund: 'art', art: 'Document' });
  assert.equal(parseOgaEntry(areaXml.replace(/CC-BY 4\.0/g, 'CC-BY-NC 4.0').replace(/OGA-BY 4\.0/g, 'CC-BY-NC-SA 3.0')).grund, 'lizenz');
});

test('OpenGameArt: Lizenzwahl nimmt zuerst ohne Namensnennung, dann ohne Share-Alike', () => {
  assert.equal(pickLicense(['CC-BY-SA 3.0', 'CC-BY 3.0', 'CC0']).id, 'CC0-1.0');
  assert.equal(pickLicense(['GPL 3.0', 'CC-BY 3.0']).id, 'CC-BY-3.0');
  assert.equal(pickLicense(['GPL 3.0']).id, 'GPL-3.0');
  // equally strict: the order of the feed decides
  assert.equal(pickLicense(['LGPL 2.1', 'GPL 2.0']).id, 'LGPL-2.1');
  assert.equal(pickLicense(['OGA-BY 4.0']).id, 'OGA-BY-4.0');
  assert.equal(pickLicense(['OGA-BY 4.0', 'CC-BY 4.0']).id, 'CC-BY-4.0');
  assert.equal(pickLicense(['LGPL 2.0']), null);
});

// ---------------------------------------------------------------------------------------------
// Openclipart

test('Openclipart: Atom-Feed wird zu CC0-Grafik mit SVG-Download, Remix-Tags fallen weg', () => {
  const { items, skipped } = parseClipart(text('openclipart-feed.xml'));
  for (const it of items) valid(it);
  assert.equal(items.length, 3);
  assert.deepEqual(skipped, { gesperrt: 0, format: 0 });
  const lib = items[0];
  assert.equal(lib.id, 'openclipart:357851');
  assert.equal(lib.kind, 'grafik');
  assert.equal(lib.license.id, 'CC0-1.0');
  assert.equal(lib.creator.name, 'maja135');
  assert.equal(lib.downloads[0].url, 'https://openclipart.org/download/357851/library.svg');
  assert.equal(lib.preview.type, 'image');
  assert.ok(lib.tags.includes('library'));
  assert.ok(!lib.tags.some((t) => t.startsWith('remix')));
});

test('Openclipart: Einträge mit pd_issue oder nsfw werden ausgelassen', () => {
  const entry = text('openclipart-feed.xml').split('<entry>')[1].split('</entry>')[0];
  const flagged = (term) => entry.replace('<category ', `<category scheme="x" term="${term}" label="${term}" /><category `);
  assert.equal(parseClipartEntry(flagged('pd_issue')).grund, 'gesperrt');
  assert.equal(parseClipartEntry(flagged('NSFW')).grund, 'gesperrt');
  assert.ok(parseClipartEntry(entry).item);
  assert.equal(parseClipartEntry(entry.replace(/<link rel="enclosure" type="image\/svg\+xml"[^>]*>/, '')).grund, 'format');
});
