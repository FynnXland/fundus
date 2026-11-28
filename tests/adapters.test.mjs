// Adapters against trimmed real API responses (fetched 23.11.2026, see tests/fixtures).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateItem } from '../crawler/lib/schema.mjs';
import { parseImage, parseAudio } from '../crawler/sources/openverse.mjs';
import { parsePage } from '../crawler/sources/wikimedia.mjs';
import { parseAsset as parsePolyHaven } from '../crawler/sources/polyhaven.mjs';
import { parseAsset as parseAmbient } from '../crawler/sources/ambientcg.mjs';
import { parseArtwork } from '../crawler/sources/artic.mjs';
import { parseRepo, parseFrontMatter, detectLicenseText, skillItem } from '../crawler/sources/github.mjs';
import { parseFont } from '../crawler/sources/fontsource.mjs';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const valid = (it) => assert.deepEqual(validateItem(it), [], JSON.stringify(it, null, 1));

test('Openverse: Bild von Flickr, Quelle bleibt Flickr, Openverse in via', () => {
  const it = parseImage(fx('openverse-image'));
  valid(it);
  assert.equal(it.source.name, 'Flickr');
  assert.deepEqual(it.via, ['Openverse']);
  assert.equal(it.license.id, 'CC-BY-2.0');
  assert.equal(it.downloads[0].url, 'https://live.staticflickr.com/3313/3481540500_c846c62863_b.jpg');
});

test('Openverse: NC-Bild wird verworfen', () => {
  assert.equal(parseImage({ ...fx('openverse-image'), license: 'by-nc' }), null);
});

test('Openverse: Freesound-Audio als Sound mit ehrlichem Download-Label', () => {
  const it = parseAudio(fx('openverse-audio'), 'sound');
  valid(it);
  assert.equal(it.kind, 'sound');
  assert.match(it.downloads[0].label, /Hörprobe/);
});

test('Wikimedia: Lizenz aus extmetadata, Urheber ohne HTML, keine Beschreibung übernommen', () => {
  const it = parsePage(fx('wikimedia-page'));
  valid(it);
  assert.equal(it.license.id, 'CC-BY-SA-3.0');
  assert.equal(it.creator.name, 'Von.grzanka');
  assert.equal(it.creator.url, 'https://commons.wikimedia.org/wiki/User:Von.grzanka');
  assert.equal(it.description, undefined);
});

test('Poly Haven: Modell mit glTF-Paket und Dateizuordnung für den Viewer', () => {
  const { info, files } = fx('polyhaven-model');
  const it = parsePolyHaven('ArmChair_01', info, files);
  valid(it);
  assert.equal(it.kind, '3d');
  assert.equal(it.preview.type, 'model');
  assert.equal(it.preview.dateien['ArmChair_01.bin'], 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/ArmChair_01/ArmChair_01.bin');
  const pkg = it.downloads.find((d) => d.paket);
  assert.ok(pkg.paket.files.some((f) => f.path === 'textures/Armchair_01_diff_2k.jpg'));
  assert.equal(it.license.id, 'CC0-1.0');
});

test('Poly Haven: Maße in Metern, Material und Zustand, 1K-Paket als letzte Option', () => {
  const { info, files } = fx('polyhaven-model');
  const it = parsePolyHaven('ArmChair_01', info, files);
  // dimensions from the listing (mm, z up): the armchair is 1.07 m high
  assert.equal(it.meta.abmessung, '0,85 × 0,77 × 1,07 m (B × T × H)');
  assert.equal(it.meta.material, 'Holz, Stoff');
  assert.equal(it.meta.zustand, 'abgenutzt');
  assert.ok(it.tags.includes('worn') && it.tags.includes('fabric'));
  assert.equal(it.downloads[0].label, 'glTF-Paket (2K-Texturen)');
  assert.equal(it.downloads.at(-1).label, 'glTF-Paket (1K-Texturen)');
  assert.ok(it.downloads.at(-1).paket.files.some((f) => f.path.endsWith('_1k.jpg')));
});

test('ambientCG: ZIP-Downloads in fester Reihenfolge', () => {
  const it = parseAmbient(fx('ambientcg-asset'));
  valid(it);
  assert.deepEqual(it.downloads.map((d) => d.label), ['1K JPG (ZIP)', '2K JPG (ZIP)', '1K PNG (ZIP)']);
  assert.equal(parseAmbient({ ...fx('ambientcg-asset'), dataType: 'HDRI' }).kind, 'hdri');
  assert.equal(parseAmbient({ ...fx('ambientcg-asset'), dataType: 'Substance' }), null);
});

test('Art Institute: nur gemeinfreie Werke, IIIF in 843 px', () => {
  const a = fx('artic-artwork');
  const it = parseArtwork(a);
  valid(it);
  assert.equal(it.license.id, 'PD');
  assert.match(it.downloads[0].url, /\/full\/843,\/0\/default\.jpg$/);
  assert.equal(parseArtwork({ ...a, is_public_domain: false }), null);
});

test('GitHub: Repo ohne erkannte Lizenz, Fork oder Archiv fällt raus', () => {
  const r = fx('github-repo');
  valid(parseRepo(r, 'projekt'));
  assert.equal(parseRepo({ ...r, license: null }, 'projekt'), null);
  assert.equal(parseRepo({ ...r, license: { spdx_id: 'NOASSERTION' } }, 'projekt'), null);
  assert.equal(parseRepo({ ...r, fork: true }, 'projekt'), null);
  assert.equal(parseRepo({ ...r, archived: true }, 'projekt'), null);
  // media repositories only under CC0 / CC BY(-SA): MIT on a sound pack is not a media licence
  assert.equal(parseRepo(r, 'sound'), null);
  assert.equal(parseRepo({ ...r, license: { spdx_id: 'CC0-1.0' } }, 'sound').license.id, 'CC0-1.0');
});

test('GitHub: SKILL.md-Frontmatter, auch gefaltete Beschreibung', () => {
  assert.deepEqual(parseFrontMatter('---\nname: pdf\ndescription: Arbeit mit PDFs\nlicense: Proprietary\n---\n# x'), { name: 'pdf', description: 'Arbeit mit PDFs' });
  assert.deepEqual(parseFrontMatter('---\nname: "mein-skill"\ndescription: >\n  Zeile eins\n  Zeile zwei\n---'), { name: 'mein-skill', description: 'Zeile eins Zeile zwei' });
  assert.deepEqual(parseFrontMatter('# ohne Frontmatter'), {});
});

test('GitHub: Lizenztext im Skill-Ordner wird erkannt', () => {
  assert.equal(detectLicenseText('                                 Apache License\n                           Version 2.0, January 2004').id, 'Apache-2.0');
  assert.equal(detectLicenseText('MIT License\n\nCopyright (c) 2025').id, 'MIT');
  assert.equal(detectLicenseText('© 2025 Anthropic, PBC. All rights reserved. Use is subject to the terms'), null);
});

test('GitHub: Skill-Eintrag mit Ordner-Paket', () => {
  const repo = { ...fx('github-repo'), full_name: 'anthropics/skills', name: 'skills', default_branch: 'main', owner: { login: 'anthropics', html_url: 'https://github.com/anthropics' } };
  const it = skillItem({
    repo,
    dir: 'skills/algorithmic-art',
    front: { name: 'algorithmic-art', description: 'Generative Kunst mit p5.js' },
    license: detectLicenseText('Apache License\n Version 2.0'),
    files: [{ path: 'skills/algorithmic-art/SKILL.md', size: 1000 }, { path: 'skills/algorithmic-art/templates/viewer.html', size: 2000 }],
  });
  valid(it);
  assert.equal(it.kind, 'skill');
  assert.equal(it.downloads[0].paket.files[1].path, 'algorithmic-art/templates/viewer.html');
  assert.equal(it.downloads[0].paket.files[1].url, 'https://raw.githubusercontent.com/anthropics/skills/main/skills/algorithmic-art/templates/viewer.html');
});

test('Fontsource: OFL-Schrift mit Gestalter, ohne Latin-Subset verworfen', () => {
  const f = fx('fontsource-font');
  const it = parseFont(f, 'Undercase Type, Phaedra Charles, Flavia Zimbardi');
  valid(it);
  assert.equal(it.license.id, 'OFL-1.1');
  assert.equal(it.preview.url, 'https://cdn.jsdelivr.net/fontsource/fonts/fraunces@latest/latin-400-normal.woff2');
  assert.equal(parseFont({ ...f, subsets: ['korean'] }), null);
});
