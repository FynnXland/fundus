// Met, Iconify and Internet Archive adapters against trimmed real API responses (fetched 23.11.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateItem } from '../crawler/lib/schema.mjs';
import { parseObject } from '../crawler/sources/met.mjs';
import { parseCollection, iconNames } from '../crawler/sources/iconify.mjs';
import { parseItem, pickMp3, searchUrl, LICENSE_URLS } from '../crawler/sources/internetarchive.mjs';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const valid = (it) => assert.deepEqual(validateItem(it), [], JSON.stringify(it, null, 1));

test('Met: gemeinfreies Objekt als CC0, kleine Vorschau, Original als Download', () => {
  const { object } = fx('met');
  const it = parseObject(object);
  valid(it);
  assert.equal(it.id, 'met:340468');
  assert.equal(it.kind, 'bild');
  assert.equal(it.license.id, 'CC0-1.0');
  assert.equal(it.creator.name, 'Perugino (Pietro di Cristoforo Vannucci)');
  assert.equal(it.preview.url, 'https://images.metmuseum.org/CRDImages/dp/web-large/DP811071.jpg');
  assert.equal(it.preview.thumb, it.preview.url);
  assert.equal(it.downloads[0].url, 'https://images.metmuseum.org/CRDImages/dp/original/DP811071.jpg');
  assert.equal(it.source.url, 'https://www.metmuseum.org/art/collection/search/340468');
});

test('Met: nicht gemeinfrei oder ohne Bild wird verworfen, ohne Künstler "unbekannt"', () => {
  const { object, objectNotPublicDomain } = fx('met');
  assert.equal(parseObject(objectNotPublicDomain), null);
  assert.equal(parseObject({ ...object, isPublicDomain: false }), null);
  assert.equal(parseObject({ ...object, primaryImage: '' }), null);
  assert.equal(parseObject({ ...object, artistDisplayName: '' }).creator.name, 'unbekannt');
});

test('Iconify: ein Eintrag pro Set mit SVG-Beispielen und JSON-Download', () => {
  const it = parseCollection('mdi', fx('iconify').mdi);
  valid(it);
  assert.equal(it.id, 'iconify:mdi');
  assert.equal(it.kind, 'icon');
  assert.equal(it.license.id, 'Apache-2.0');
  assert.equal(it.creator.name, 'Pictogrammers');
  assert.equal(it.preview.thumb, 'https://api.iconify.design/mdi/account-check.svg');
  assert.equal(it.preview.icons.length, 6);
  assert.deepEqual(it.collection, { id: 'mdi', name: 'Material Design Icons', url: 'https://icon-sets.iconify.design/mdi/' });
  assert.equal(it.downloads[0].url, 'https://raw.githubusercontent.com/iconify/icon-sets/master/json/mdi.json');
  assert.equal(it.downloads.length, 1);
  assert.equal(it.meta.icons, '7447');
});

test('Iconify: CC BY geht durch, NC und versteckte Sets nicht, höchstens 12 Beispiele', () => {
  const sets = fx('iconify');
  assert.equal(parseCollection('solar', sets.solar).license.id, 'CC-BY-4.0');
  assert.equal(parseCollection('ps', { ...sets.ps, hidden: false }), null);
  assert.equal(parseCollection('zmdi', sets.zmdi), null);
  const more = iconNames({ uncategorized: ['a1', 'a2'], categories: { X: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'] }, hidden: ['b7'] });
  assert.deepEqual(more, ['a1', 'a2', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
  assert.equal(parseCollection('mdi', sets.mdi, more).preview.icons.length, 12);
});

test('Internet Archive: Netlabel-Album mit erster MP3, MD5 und ZIP unter 300 MB', () => {
  const { metadata } = fx('internetarchive');
  const it = parseItem(metadata);
  valid(it);
  assert.equal(it.kind, 'musik');
  assert.equal(it.license.id, 'CC-BY-3.0');
  assert.equal(it.creator.name, 'Yukiga Futte Uresii');
  assert.equal(it.preview.type, 'audio');
  assert.equal(it.preview.url, 'https://archive.org/download/Unounoou/01_Oonoon.mp3');
  assert.equal(it.preview.thumb, 'https://archive.org/services/img/Unounoou');
  assert.equal(it.downloads[0].url, it.preview.url);
  assert.equal(it.downloads[1].url, 'https://archive.org/compress/Unounoou');
  assert.equal(it.hashes.md5, '2edabc37ba38dfcade614d3a35cf9cb3');
  assert.equal(it.meta.dauer, '1806 s');
  assert.equal(it.meta.sammlung, 'oloil');
});

test('Internet Archive: Lizenz nur exakt aus der Whitelist, großes Item ohne ZIP', () => {
  const { metadata } = fx('internetarchive');
  const withLicense = (u) => parseItem({ ...metadata, metadata: { ...metadata.metadata, licenseurl: u } });
  assert.equal(withLicense('http://creativecommons.org/licenses/by-nc-sa/3.0/'), null);
  assert.equal(withLicense('http://creativecommons.org/licenses/by/3.0/us/'), null);
  assert.equal(withLicense(undefined), null);
  assert.equal(withLicense('https://creativecommons.org/publicdomain/mark/1.0/').license.id, 'PDM-1.0');
  assert.equal(parseItem({}), null);
  const big = parseItem({ ...metadata, item_size: 3072122222 });
  assert.equal(big.downloads.length, 1);
  assert.equal(LICENSE_URLS.length, 12);
});

test('Internet Archive: MP3-Auswahl nach Titelnummer, Dateinamen werden kodiert', () => {
  const files = [
    { name: 'CD 1/02 Zwei #2.mp3', format: 'VBR MP3', track: '2' },
    { name: 'CD 1/01 Eins.mp3', format: '128Kbps MP3', track: '1/9' },
    { name: 'CD 1/01 Eins.flac', format: 'Flac', track: '1' },
  ];
  assert.equal(pickMp3(files).name, 'CD 1/01 Eins.mp3');
  const { metadata } = fx('internetarchive');
  const it = parseItem({ ...metadata, files: [files[0]] });
  assert.equal(it.downloads[0].url, 'https://archive.org/download/Unounoou/CD%201/02%20Zwei%20%232.mp3');
  assert.equal(it.hashes, undefined);
  // Item without creator in the metadata (real case: gt536Maelstrom-ThePassage): artist from the file tags.
  const noCreator = parseItem({ ...metadata, metadata: { ...metadata.metadata, creator: undefined }, files: [{ ...files[0], creator: 'Maelstrom' }] });
  assert.equal(noCreator.creator.name, 'Maelstrom');
  assert.match(decodeURIComponent(searchUrl('netlabels', 10, 1)), /collection:"netlabels"/);
});
