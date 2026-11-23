// Picture, material and 3D sources (Wikimedia groups, museums, glTF samples) against trimmed real
// responses in tests/fixtures, plus the pure crawl-state functions (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateItem } from '../crawler/lib/schema.mjs';
import { advanceStrand, emptyStrand, prepareStrand } from '../crawler/sources/stand-helfer.mjs';
import europeana, { parseItem as parseEuropeanaItem, europeanaLicense, requestUrl as europeanaUrl } from '../crawler/sources/europeana.mjs';
import nga, { csvRows, parseCsv, openImages, parseObject as parseNgaObject, nextBatch } from '../crawler/sources/nga.mjs';
import smk, { parseArtwork as parseSmkArtwork, nextOffset as smkNextOffset, requestUrl as smkUrl } from '../crawler/sources/smk.mjs';
import wellcome, { parseWork as parseWellcomeWork, strandsFromConfig, requestUrl as wellcomeUrl, nextPage as wellcomeNextPage, pickStrand } from '../crawler/sources/wellcome.mjs';
import rijks, { parseRecord as parseRijksRecord, splitRecords, resumption, listUrl as rijksListUrl } from '../crawler/sources/rijksmuseum.mjs';
import khronos, { parseModel as parseKhronosModel, licenseOf as khronosLicense, viewerCanShow, sizesFromTree } from '../crawler/sources/khronos.mjs';
import cleveland, { parseArtwork as parseClevelandArtwork, nextOffset as clevelandNextOffset, requestUrl as clevelandUrl } from '../crawler/sources/cleveland.mjs';
import {
  parsePage, kindFor, allowedAs, groupsFromConfig, budgetFromConfig, DEFAULT_GROUPS,
  emptyState, prepareState, nextGroup, applyPage, applyError, requestParams, addUnique, SEARCH_MAX,
} from '../crawler/sources/wikimedia.mjs';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const valid = (it) => assert.deepEqual(validateItem(it), [], JSON.stringify(it, null, 1));

// --- Wikimedia Commons: groups ---------------------------------------------------------------

const wm = fx('wikimedia-gruppen');
const page = (prefix) => wm.query.pages.find((p) => p.title.startsWith(`File:${prefix}`));

test('Wikimedia: alter Test-Eintrag bleibt ein Bild mit 960-px-Vorschau', () => {
  const it = parsePage(fx('wikimedia-page'));
  valid(it);
  assert.equal(it.kind, 'bild');
  assert.match(it.preview.url, /\/960px-/);
  assert.equal(it.hashes, undefined);
});

test('Wikimedia: SVG-Clipart wird Grafik mit SVG-Download und PNG-Vorschau', () => {
  const p = page('Lemmling-Cartoon-cow');
  assert.equal(kindFor(p, DEFAULT_GROUPS, 'grafik'), 'grafik');
  const it = parsePage(p, 'grafik');
  valid(it);
  assert.equal(it.id, `wikimedia:${p.pageid}`);
  assert.match(it.sig, /^GFX·WM·/);
  assert.equal(it.license.id, 'CC0-1.0');
  assert.match(it.preview.thumb, /\/500px-Lemmling-Cartoon-cow\.svg\.png/);
  assert.match(it.preview.url, /\/960px-Lemmling-Cartoon-cow\.svg\.png/);
  assert.equal(it.downloads[0].format, 'svg');
  assert.match(it.downloads[0].url, /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/5\/5e\/Lemmling-Cartoon-cow\.svg/);
  assert.equal(it.hashes.sha1, p.imageinfo[0].sha1);
});

test('Wikimedia: Wappen aus der Clipart-Kategorie wird verworfen, nicht als Grafik geführt', () => {
  const p = page('Insigne Falklandiae');
  assert.equal(allowedAs('grafik', p), false);
  assert.equal(kindFor(p, DEFAULT_GROUPS, 'grafik'), null);
  assert.equal(parsePage(p, 'grafik'), null);
  // found through a picture group it stays an ordinary picture
  assert.equal(kindFor(p, DEFAULT_GROUPS, 'bild'), 'bild');
});

test('Wikimedia: STL wird 3D-Modell mit gerendertem PNG als Vorschau, ohne Pixelmaß', () => {
  const p = page('High quality skull');
  assert.equal(kindFor(p, DEFAULT_GROUPS, 'bild'), '3d');
  const it = parsePage(p, '3d');
  valid(it);
  assert.equal(it.kind, '3d');
  assert.equal(it.license.id, 'CC-BY-SA-4.0');
  assert.equal(it.preview.type, 'image');
  assert.match(it.preview.url, /High_quality_skull\.stl\/960px-High_quality_skull\.stl\.png/);
  assert.equal(it.downloads[0].format, 'stl');
  assert.equal(it.downloads[0].label, 'STL-Datei (3D-Modell)');
  assert.equal(it.meta, undefined);
  // an STL never passes as a picture
  assert.equal(parsePage(p, 'bild'), null);
});

test('Wikimedia: Kacheltextur wird Material, auch wenn sie über eine Bildgruppe kommt', () => {
  const p = page('Beige wavy slate');
  assert.equal(kindFor(p, DEFAULT_GROUPS, 'bild'), 'textur');
  const it = parsePage(p, 'textur');
  valid(it);
  assert.match(it.sig, /^TEX·WM·/);
  assert.equal(it.license.id, 'CC0-1.0');
  assert.ok(!it.tags.some((t) => /tileable|cc-zero/.test(t)));
});

test('Wikimedia: Original unter 960 px wird selbst zur großen Vorschau', () => {
  const p = page('Buff Terra-Cotta');
  const it = parsePage(p, kindFor(p, DEFAULT_GROUPS, 'textur'));
  valid(it);
  assert.equal(it.license.id, 'PD');
  assert.match(it.preview.url, /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/3\/3c\/Buff_Terra-Cotta\.jpg/);
});

test('Wikimedia: „No restrictions“ (Flickr Commons, British Library) ist keine offene Lizenz', () => {
  const p = page('164 of');
  assert.equal(parsePage(p, 'bild'), null);
  const ohneUrl = structuredClone(p);
  delete ohneUrl.imageinfo[0].extmetadata.LicenseUrl;
  assert.equal(parsePage(ohneUrl, 'bild'), null);
});

test('Wikimedia: NC-Lizenz wird verworfen', () => {
  const p = structuredClone(page('Lemmling-Cartoon-cow'));
  p.imageinfo[0].extmetadata.LicenseShortName.value = 'CC BY-NC 4.0';
  p.imageinfo[0].extmetadata.LicenseUrl.value = 'https://creativecommons.org/licenses/by-nc/4.0/';
  assert.equal(parsePage(p, 'grafik'), null);
});

test('Wikimedia: Doppelte im selben Lauf behalten die genauere Art', () => {
  const m = new Map();
  addUnique(m, { id: 'wikimedia:1', kind: 'bild' });
  addUnique(m, { id: 'wikimedia:1', kind: 'textur' });
  addUnique(m, { id: 'wikimedia:1', kind: 'bild' });
  assert.equal(m.get('wikimedia:1').kind, 'textur');
});

// --- Wikimedia Commons: config and crawl state ----------------------------------------------

test('Wikimedia: altes Konfigurationsformat ergibt Bildgruppen und ein Budget aus dem Limit', () => {
  const cfg = { kategorien: ['Category:Featured_pictures_on_Wikimedia_Commons', 'Category:Valued_images_sorted_by_promotion_date'], limit: 3000 };
  const groups = groupsFromConfig(cfg);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.art === 'bild' && g.kategorie));
  assert.equal(budgetFromConfig(cfg, groups), 120);
  assert.equal(groupsFromConfig({}).length, DEFAULT_GROUPS.length);
  assert.equal(budgetFromConfig({ gruppen: DEFAULT_GROUPS, budget: 50 }), 50);
});

test('Wikimedia: Abfrageparameter tragen das ganze continue-Objekt weiter', () => {
  const cat = requestParams({ id: 'k', art: 'textur', kategorie: 'Category:Tileable_textures' }, wm.continue);
  assert.equal(cat.generator, 'categorymembers');
  assert.equal(cat.gcmcontinue, wm.continue.gcmcontinue);
  assert.equal(cat.continue, 'gcmcontinue||');
  const search = requestParams({ id: '3d', art: '3d', suche: 'filetype:3d' }, { gsroffset: 100, continue: 'gsroffset||' });
  assert.equal(search.generator, 'search');
  assert.equal(search.gsrnamespace, 6);
  assert.equal(search.gsroffset, 100);
});

const G = [
  { id: 'a', art: 'bild', kategorie: 'Category:A' },
  { id: 'b', art: 'textur', kategorie: 'Category:B' },
  { id: 's', art: '3d', suche: 'filetype:3d' },
];

test('Wikimedia-Stand: neue Gruppen, Reihenfolge nach Fortschritt, Ende ohne continue', () => {
  let st = prepareState(emptyState(), G, { heute: '2026-11-23' });
  assert.deepEqual(Object.keys(st.gruppen), ['a', 'b', 's']);
  assert.equal(nextGroup(st, G).id, 'a');
  st = applyPage(st, 'a', { gcmcontinue: 'x|1', continue: 'gcmcontinue||' }, '2026-11-23T10:00:00Z');
  assert.equal(nextGroup(st, G).id, 'b');
  assert.deepEqual(st.gruppen.a.weiter, { gcmcontinue: 'x|1', continue: 'gcmcontinue||' });
  st = applyPage(st, 'b', undefined, '2026-11-23T10:01:00Z');
  assert.equal(st.gruppen.b.fertig, true);
  assert.equal(st.gruppen.b.fertigAm, '2026-11-23');
  assert.equal(nextGroup(st, G).id, 's');
});

test('Wikimedia-Stand: Suche endet an der Grenze von 10 000 Treffern', () => {
  let st = prepareState(emptyState(), G, { heute: '2026-11-23' });
  st = applyPage(st, 's', { gsroffset: SEARCH_MAX - 50, continue: 'gsroffset||' });
  assert.equal(st.gruppen.s.fertig, false);
  st = applyPage(st, 's', { gsroffset: SEARCH_MAX, continue: 'gsroffset||' });
  assert.equal(st.gruppen.s.fertig, true);
  // the API's own refusal ends the group as well
  let st2 = prepareState(emptyState(), G, { heute: '2026-11-23' });
  st2 = applyPage(st2, 's', { gsroffset: 9950, continue: 'gsroffset||' });
  st2 = applyError(st2, 's', 'cirrussearch-offset-too-large');
  assert.equal(st2.gruppen.s.fertig, true);
});

test('Wikimedia-Stand: abgelehnter Fortsetzungs-Token startet die Gruppe neu, abgelehnte erste Seite beendet sie', () => {
  let st = prepareState(emptyState(), G, { heute: '2026-11-23' });
  st = applyPage(st, 'a', { gcmcontinue: 'alt|1', continue: 'gcmcontinue||' });
  st = applyError(st, 'a', 'badcontinue');
  assert.equal(st.gruppen.a.weiter, null);
  assert.equal(st.gruppen.a.seiten, 0);
  assert.equal(st.gruppen.a.fertig, false);
  st = applyError(st, 'a', 'badcontinue');
  assert.equal(st.gruppen.a.fertig, true);
  assert.equal(st.gruppen.a.fehler, 'badcontinue');
});

test('Wikimedia-Stand: fertige Gruppe beginnt erst nach der Wartezeit neu, nie am selben Tag', () => {
  let st = prepareState(emptyState(), G, { heute: '2026-11-23' });
  st = applyPage(st, 'b', undefined, '2026-11-23T10:00:00Z');
  assert.equal(prepareState(st, G, { heute: '2026-11-23', wiederholenNachTagen: 0 }).gruppen.b.fertig, true);
  assert.equal(prepareState(st, G, { heute: '2026-11-30', wiederholenNachTagen: 14 }).gruppen.b.fertig, true);
  const neu = prepareState(st, G, { heute: '2026-12-07', wiederholenNachTagen: 14 });
  assert.equal(neu.gruppen.b.fertig, false);
  assert.equal(neu.gruppen.b.runde, 2);
  assert.equal(neu.gruppen.b.seiten, 0);
  // the stored state is never modified
  assert.equal(st.gruppen.b.fertig, true);
});

test('Wikimedia-Stand: geänderte Kategorie setzt nur diese Gruppe zurück', () => {
  let st = prepareState(emptyState(), G, { heute: '2026-11-23' });
  st = applyPage(st, 'a', { gcmcontinue: 'x|1', continue: 'gcmcontinue||' });
  st = applyPage(st, 'b', { gcmcontinue: 'y|2', continue: 'gcmcontinue||' });
  const G2 = [{ ...G[0], kategorie: 'Category:A2' }, G[1], G[2]];
  const neu = prepareState(st, G2, { heute: '2026-11-24' });
  assert.equal(neu.gruppen.a.weiter, null);
  assert.equal(neu.gruppen.a.quelle, 'kategorie:Category:A2');
  assert.deepEqual(neu.gruppen.b.weiter, { gcmcontinue: 'y|2', continue: 'gcmcontinue||' });
});

// --- Stage state shared by the museum sources -------------------------------------------------

test('Stand-Helfer: Strang rückt vor, endet bei weiter=null und startet erst nach der Wartezeit neu', () => {
  let s = emptyStrand();
  s = advanceStrand(s, 200, '2026-11-23');
  assert.deepEqual(s, { weiter: 200, fertig: false, fertigAm: null, seiten: 1 });
  s = advanceStrand(s, null, '2026-11-23');
  assert.equal(s.fertig, true);
  assert.equal(s.fertigAm, '2026-11-23');
  assert.equal(prepareStrand(s, { heute: '2026-11-23', nachTagen: 0 }).fertig, true);
  assert.equal(prepareStrand(s, { heute: '2026-11-30', nachTagen: 14 }).fertig, true);
  const neu = prepareStrand(s, { heute: '2026-12-07', nachTagen: 14 });
  assert.equal(neu.fertig, false);
  assert.equal(neu.weiter, null);
  assert.equal(neu.seiten, 0);
  // unusable stored values start a fresh strand
  assert.deepEqual(prepareStrand(undefined, { heute: '2026-11-23' }), emptyStrand());
});

// --- Cleveland Museum of Art (C1) -------------------------------------------------------------

const cma = fx('cleveland-artworks').data;

test('Cleveland: CC0-Gemälde wird Bild mit web-Vorschau, print-JPEG und TIFF', () => {
  const it = parseClevelandArtwork(cma[0]);
  valid(it);
  assert.equal(it.id, 'cleveland:1915.534');
  assert.equal(it.kind, 'bild');
  assert.match(it.sig, /^BLD·C1·/);
  assert.equal(it.license.id, 'CC0-1.0');
  assert.equal(it.creator.name, 'John Singleton Copley');
  assert.equal(it.source.url, 'https://www.clevelandart.org/art/1915.534');
  assert.equal(it.preview.thumb, 'https://openaccess-cdn.clevelandart.org/1915.534/1915.534_web.jpg');
  assert.equal(it.preview.url, it.preview.thumb);
  assert.equal(it.downloads[0].url, 'https://openaccess-cdn.clevelandart.org/1915.534/1915.534_print.jpg');
  assert.equal(it.downloads[0].size, 5904910);
  assert.equal(it.downloads[1].format, 'tif');
  assert.equal(it.meta.abmessung, '2849 × 3400 px');
  assert.equal(it.hashes, undefined);
});

test('Cleveland: Objekt ohne Künstler heißt unbekannt, Kultur und Typ werden Schlagwörter', () => {
  const it = parseClevelandArtwork(cma[1]);
  valid(it);
  assert.equal(it.creator.name, 'unbekannt');
  assert.ok(it.tags.includes('bound volume'));
  assert.ok(it.tags.includes('medieval art'));
});

test('Cleveland: urheberrechtlich geschütztes Objekt wird verworfen', () => {
  assert.equal(cma[2].share_license_status, 'Copyrighted');
  assert.equal(parseClevelandArtwork(cma[2]), null);
});

test('Cleveland: CC0 ohne Bild, mit Rechteinhaber-Zeile oder mit anderem Status wird verworfen', () => {
  assert.equal(parseClevelandArtwork({ ...cma[0], images: {} }), null);
  assert.equal(parseClevelandArtwork({ ...cma[0], copyright: '© Someone' }), null);
  assert.equal(parseClevelandArtwork({ ...cma[0], share_license_status: 'cc0' }), null);
  assert.equal(parseClevelandArtwork({ ...cma[0], share_license_status: undefined }), null);
  assert.equal(parseClevelandArtwork(null), null);
});

test('Cleveland: Seitenlogik endet bei kurzer Seite oder erreichter Gesamtzahl', () => {
  assert.equal(clevelandNextOffset(0, 200, 41902, 200), 200);
  assert.equal(clevelandNextOffset(41800, 102, 41902, 200), null);
  assert.equal(clevelandNextOffset(41800, 200, 42000, 200), null);
  assert.equal(clevelandNextOffset(0, 0, 41902, 200), null);
  const u = new URL(clevelandUrl(400, 200));
  assert.equal(u.searchParams.get('cc0'), '1');
  assert.equal(u.searchParams.get('has_image'), '1');
  assert.equal(u.searchParams.get('skip'), '400');
  assert.equal(cleveland.code, 'C1');
});

// --- Khronos glTF Sample Assets (C8) ----------------------------------------------------------

const kh = fx('khronos-modelle');
const khSizes = sizesFromTree(kh.tree);
const khModel = (name) => parseKhronosModel(kh.index.find((e) => e.name === name), kh.meta[name], khSizes, kh.gltf[name]);

test('Khronos: CC0-Modell mit kleinem glb wird 3D-Modell mit Modellvorschau und Screenshot', () => {
  const it = khModel('Avocado');
  valid(it);
  assert.equal(it.id, 'khronos:Avocado');
  assert.equal(it.kind, '3d');
  assert.match(it.sig, /^3D·C8·/);
  assert.equal(it.license.id, 'CC0-1.0');
  assert.equal(it.creator.name, 'Microsoft');
  assert.equal(it.preview.type, 'model');
  assert.equal(it.preview.url, 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/glTF-Binary/Avocado.glb');
  assert.equal(it.preview.thumb, 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/screenshot/screenshot.jpg');
  assert.equal(it.downloads[0].format, 'glb');
  assert.equal(it.downloads[0].size, 8110040);
  const pkg = it.downloads[1].paket;
  assert.equal(pkg.files[0].path, 'Avocado.gltf');
  assert.deepEqual(pkg.files.map((f) => f.path).sort(), ['Avocado.bin', 'Avocado.gltf', 'Avocado_baseColor.png', 'Avocado_normal.png', 'Avocado_roughnessMetallic.png']);
  assert.equal(it.hashes, undefined);
});

test('Khronos: zwei Urheber werden zusammengeführt, CC-BY bleibt CC-BY', () => {
  const toy = khModel('ToyCar');
  valid(toy);
  assert.equal(toy.creator.name, 'Guido Odendahl, Eric Chadwick');
  assert.equal(toy.preview.type, 'model');
  const beautiful = khModel('ABeautifulGame');
  valid(beautiful);
  assert.equal(beautiful.license.id, 'CC-BY-4.0');
  assert.equal(beautiful.license.attribution, true);
});

test('Khronos: glb über 15 MB bekommt nur den Screenshot als Vorschau', () => {
  const it = khModel('ABeautifulGame');
  assert.equal(it.preview.type, 'image');
  assert.match(it.preview.url, /screenshot\.jpg$/);
  assert.equal(it.downloads[0].size, 42977928);
});

test('Khronos: unbekannte oder dekoder-pflichtige Erweiterung → Screenshot statt Modellvorschau', () => {
  assert.equal(khModel('NodeVisibilityTest').preview.type, 'image');
  assert.equal(viewerCanShow({ extensionsUsed: ['KHR_materials_clearcoat', 'KHR_texture_transform'] }), true);
  assert.equal(viewerCanShow({ extensionsUsed: ['KHR_draco_mesh_compression'], extensionsRequired: ['KHR_draco_mesh_compression'] }), false);
  assert.equal(viewerCanShow({ extensionsRequired: ['KHR_materials_pbrSpecularGlossiness'] }), false);
  assert.equal(viewerCanShow({ extensionsUsed: ['KHR_texture_basisu'] }), false);
  assert.equal(viewerCanShow({}), true);
  // unknown content of the .gltf means: no 3D preview
  const e = kh.index.find((x) => x.name === 'Avocado');
  assert.equal(parseKhronosModel(e, kh.meta.Avocado, khSizes, null).preview.type, 'image');
});

test('Khronos: ein einziger Lizenzeintrag außerhalb der Whitelist verwirft das ganze Modell', () => {
  // DamagedHelmet: CC-BY-4.0 plus CC-BY-NC-4.0 for an earlier version of the model
  assert.equal(khModel('DamagedHelmet'), null);
  // BrainStem: LicenseRef-Poser-EULA
  assert.equal(khModel('BrainStem'), null);
  assert.equal(khronosLicense([{ spdx: 'CC0-1.0' }, { spdx: 'LicenseRef-LegalMark-Khronos' }]), null);
  assert.equal(khronosLicense([{ spdx: 'CC-BY-SA-4.0' }, { spdx: 'CC0-1.0' }]), 'by-sa');
  assert.equal(khronosLicense([{ spdx: 'CC-BY-4.0' }, { spdx: 'CC0-1.0' }]), 'by');
  assert.equal(khronosLicense([]), null);
  assert.equal(khronosLicense(undefined), null);
  assert.equal(khronos.code, 'C8');
});

// --- Rijksmuseum (C5), OAI-PMH EDM ------------------------------------------------------------

const rkXml = readFileSync(new URL('./fixtures/rijksmuseum-oai.xml', import.meta.url), 'utf8');
const rkRecords = splitRecords(rkXml);

test('Rijksmuseum: PDM-Objekt mit Künstler wird Bild mit IIIF-Vorschau und Download', () => {
  assert.equal(rkRecords.length, 4);
  const it = parseRijksRecord(rkRecords[0]);
  valid(it);
  assert.equal(it.id, 'rijksmuseum:20010000');
  assert.equal(it.kind, 'bild');
  assert.match(it.sig, /^BLD·C5·/);
  assert.equal(it.license.id, 'PDM-1.0');
  assert.equal(it.creator.name, 'Adriaen Matham');
  assert.equal(it.title, 'Portret van Dirk I, graaf van Holland');
  assert.equal(it.source.url, 'https://www.rijksmuseum.nl/nl/collectie/object/RP-P-1906-2550--377d0d5403462d8f6ff78ca7dad6a2de');
  assert.equal(it.preview.thumb, 'https://iiif.micr.io/owHmZ/full/400,/0/default.jpg');
  assert.equal(it.preview.url, 'https://iiif.micr.io/owHmZ/full/1600,/0/default.jpg');
  assert.equal(it.downloads[0].url, 'https://iiif.micr.io/owHmZ/full/max/0/default.jpg');
  assert.equal(it.meta.inventarnummer, 'RP-P-1906-2550');
  assert.equal(it.hashes, undefined);
});

test('Rijksmuseum: Objekt ohne Urheberangabe heißt unbekannt', () => {
  const it = parseRijksRecord(rkRecords[1]);
  valid(it);
  assert.equal(it.id, 'rijksmuseum:200100002');
  assert.equal(it.creator.name, 'unbekannt');
});

test('Rijksmuseum: urheberrechtlich geschütztes Objekt (In Copyright) wird verworfen, auch mit Rechteinhaber-Zeile', () => {
  assert.match(rkRecords[2], /rightsstatements\.org\/vocab\/InC\/1\.0/);
  assert.equal(parseRijksRecord(rkRecords[2]), null);
  assert.match(rkRecords[3], /<dc:rights/);
  assert.equal(parseRijksRecord(rkRecords[3]), null);
});

test('Rijksmuseum: CC0-URL passt, offene URL mit Rechteinhaber-Zeile, gelöschter Satz und fremdes Bild nicht', () => {
  const cc0 = rkRecords[0].replace('http://creativecommons.org/publicdomain/mark/1.0/', 'http://creativecommons.org/publicdomain/zero/1.0/');
  assert.equal(parseRijksRecord(cc0).license.id, 'CC0-1.0');
  assert.equal(parseRijksRecord(rkRecords[0].replace('</edm:ProvidedCHO>', '<dc:rights xml:lang="nl">Erben X</dc:rights></edm:ProvidedCHO>')), null);
  assert.equal(parseRijksRecord(rkRecords[0].replace('<header>', '<header status="deleted">')), null);
  assert.equal(parseRijksRecord(rkRecords[0].replaceAll('https://iiif.micr.io/', 'https://example.org/')), null);
  assert.equal(parseRijksRecord(rkRecords[0].replace('<edm:type>IMAGE</edm:type>', '<edm:type>TEXT</edm:type>')), null);
  assert.equal(parseRijksRecord(rkRecords[0].replace(/<edm:rights [^>]*>/, '')), null);
  assert.equal(parseRijksRecord(''), null);
});

test('Rijksmuseum: Fortsetzungsmarke und Gesamtzahl werden gelesen, letzte Seite hat keine', () => {
  const r = resumption(rkXml);
  assert.equal(r.total, 848910);
  assert.match(r.token, /^bWV0YWRhdGFQcmVmaXg9ZWRt/);
  assert.deepEqual(resumption('<ListRecords><resumptionToken completeListSize="5"/></ListRecords>'), { token: null, total: undefined });
  assert.equal(resumption('<ListRecords></ListRecords>').token, null);
  const first = new URL(rijksListUrl(null));
  assert.equal(first.searchParams.get('verb'), 'ListRecords');
  assert.equal(first.searchParams.get('metadataPrefix'), 'edm');
  const next = new URL(rijksListUrl('abc=='));
  assert.equal(next.searchParams.get('resumptionToken'), 'abc==');
  assert.equal(next.searchParams.get('metadataPrefix'), null);
  assert.equal(rijks.code, 'C5');
});

// --- Wellcome Collection (C2) -----------------------------------------------------------------

const wc = fx('wellcome-works').results;

test('Wellcome: PDM-Druck wird Bild mit IIIF-Vorschau, Urheber aus dem Hauptbeitragenden', () => {
  const it = parseWellcomeWork(wc[0]);
  valid(it);
  assert.equal(it.id, 'wellcome:a22jbu3k');
  assert.equal(it.kind, 'bild');
  assert.match(it.sig, /^BLD·C2·/);
  assert.equal(it.license.id, 'PDM-1.0');
  assert.equal(it.creator.name, 'John Jackson');
  assert.equal(it.source.url, 'https://wellcomecollection.org/works/a22jbu3k');
  assert.equal(it.preview.thumb, 'https://iiif.wellcomecollection.org/image/V0014156/full/400,/0/default.jpg');
  assert.equal(it.preview.url, 'https://iiif.wellcomecollection.org/image/V0014156/full/1024,/0/default.jpg');
  assert.equal(it.downloads[1].url, 'https://iiif.wellcomecollection.org/image/V0014156/full/max/0/default.jpg');
  assert.ok(it.tags.includes('wood engravings'));
  assert.equal(it.meta.entstanden, '1845');
  assert.equal(it.hashes, undefined);
});

test('Wellcome: CC-BY verlangt Namensnennung, ohne Urheber wird die Sammlung genannt, HTML im Titel fällt weg', () => {
  const by = parseWellcomeWork(wc[1]);
  valid(by);
  assert.equal(by.license.id, 'CC-BY-4.0');
  assert.equal(by.license.attribution, true);
  assert.equal(by.creator.name, 'Wellcome Collection');
  const zero = parseWellcomeWork(wc[2]);
  valid(zero);
  assert.equal(zero.license.id, 'CC0-1.0');
  assert.equal(zero.title, 'Plasmodium falciparum malaria: blackwater fever');
});

test('Wellcome: CC BY-NC und In Copyright werden verworfen', () => {
  assert.equal(wc[3].items[0].locations[0].license.id, 'cc-by-nc');
  assert.equal(parseWellcomeWork(wc[3]), null);
  assert.equal(wc[4].items[0].locations[0].license.id, 'inc');
  assert.equal(parseWellcomeWork(wc[4]), null);
});

test('Wellcome: gemischte Lizenzen, eingeschränkter Zugang, fremder Bildhost und Nicht-Werke werden verworfen', () => {
  const extra = JSON.parse(JSON.stringify(wc[0]));
  extra.items[0].locations.push({ ...extra.items[0].locations[1], license: { id: 'cc-by-nc' } });
  assert.equal(parseWellcomeWork(extra), null);
  const closed = JSON.parse(JSON.stringify(wc[0]));
  closed.items[0].locations[1].accessConditions = [{ status: { id: 'restricted' } }];
  assert.equal(parseWellcomeWork(closed), null);
  const other = JSON.parse(JSON.stringify(wc[0]));
  other.items[0].locations[1].url = 'https://example.org/image/V1/info.json';
  assert.equal(parseWellcomeWork(other), null);
  assert.equal(parseWellcomeWork({ ...wc[0], type: 'Collection' }), null);
  assert.equal(parseWellcomeWork(null), null);
});

test('Wellcome-Stränge: Standardliste, Seitenlogik und Auswahl des nächsten Strangs', () => {
  const strands = strandsFromConfig({});
  assert.ok(strands.length > 10);
  assert.ok(strands.every((s) => ['pdm', 'cc-by', 'cc-0'].includes(s.license)));
  // a strand with a licence outside the whitelist is ignored even if configured
  assert.equal(strandsFromConfig({ straenge: [{ id: 'x', license: 'cc-by-nc' }, { id: 'y', license: 'pdm' }] }).length, 1);
  const u = new URL(wellcomeUrl({ id: 'a', license: 'pdm', workType: 'k', from: '1800-01-01', to: '1849-12-31' }, 3));
  assert.equal(u.searchParams.get('items.locations.license'), 'pdm');
  assert.equal(u.searchParams.get('production.dates.from'), '1800-01-01');
  assert.equal(u.searchParams.get('page'), '3');
  assert.equal(u.searchParams.get('sort'), null);
  // the API stops at 10,000 works, i.e. page 100 of 100
  assert.equal(wellcomeNextPage(1, 100, 'https://next'), 2);
  assert.equal(wellcomeNextPage(100, 100, 'https://next'), null);
  assert.equal(wellcomeNextPage(5, 40, 'https://next'), null);
  assert.equal(wellcomeNextPage(5, 100, undefined), null);
  const s = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const state = { straenge: { a: { seiten: 3, fertig: false }, b: { seiten: 1, fertig: false }, c: { seiten: 0, fertig: true } } };
  assert.equal(pickStrand(state, s).id, 'b');
  state.straenge.b.fertig = true;
  state.straenge.a.fertig = true;
  assert.equal(pickStrand(state, s), null);
  assert.equal(wellcome.code, 'C2');
});

// --- Statens Museum for Kunst (C3) ------------------------------------------------------------

const smkItems = fx('smk-search').items;

test('SMK: Public-Domain-Objekt wird Bild, die 1024-px-Vorschau der API dient als Mini- und große Vorschau', () => {
  const it = parseSmkArtwork(smkItems[2]);
  valid(it);
  assert.equal(it.id, 'smk:KMS8914');
  assert.equal(it.kind, 'bild');
  assert.match(it.sig, /^BLD·C3·/);
  assert.equal(it.license.id, 'PDM-1.0');
  assert.equal(it.creator.name, 'Mogens Ballin');
  assert.equal(it.title, 'Wood with Crooked Tree');
  assert.equal(it.source.url, 'https://open.smk.dk/artwork/image/KMS8914');
  assert.equal(it.preview.thumb, smkItems[2].image_thumbnail);
  assert.equal(it.preview.url, 'https://iip-thumb.smk.dk/iiif/jp2/gf06g715p_kms8914.tif.jp2/full/!1024,/0/default.jpg');
  assert.match(it.downloads[0].url, /^https:\/\/api\.smk\.dk\/api\/v1\/download\//);
  assert.equal(it.downloads[0].format, 'jpg');
  assert.equal(it.meta.abmessung, '9581 × 11258 px');
  assert.ok(it.tags.includes('painting'));
  assert.equal(it.hashes, undefined);
});

test('SMK: Druck mit dänischem Titel und Künstlerangabe wird übernommen', () => {
  const it = parseSmkArtwork(smkItems[0]);
  valid(it);
  assert.equal(it.creator.name, 'Antonio da Trento');
  assert.equal(it.meta.technik, 'Chiaroscuro woodcut');
});

test('SMK: Objekt ohne Public-Domain-Kennzeichnung wird verworfen', () => {
  assert.equal(smkItems[3].public_domain, false);
  assert.equal(parseSmkArtwork(smkItems[3]), null);
});

test('SMK: fremde Rechte-URL, fehlendes Bild und fremder Bildhost werden verworfen', () => {
  assert.equal(parseSmkArtwork({ ...smkItems[2], rights: 'https://www.smk.dk/en/section/use-of-smk-material/' }), null);
  assert.equal(parseSmkArtwork({ ...smkItems[2], public_domain: 'true' }), null);
  assert.equal(parseSmkArtwork({ ...smkItems[2], has_image: false }), null);
  assert.equal(parseSmkArtwork({ ...smkItems[2], image_thumbnail: 'https://example.org/full/!1024,/0/default.jpg' }), null);
  assert.equal(parseSmkArtwork({ ...smkItems[2], image_native: undefined }), null);
  assert.equal(parseSmkArtwork({ ...smkItems[2], titles: [] }), null);
  assert.equal(parseSmkArtwork(null), null);
});

test('SMK: Seitenlogik endet bei kurzer Seite oder erreichter Gesamtzahl', () => {
  assert.equal(smkNextOffset(0, 200, 39548, 200), 200);
  assert.equal(smkNextOffset(39400, 148, 39548, 200), null);
  assert.equal(smkNextOffset(39400, 200, 39600, 200), null);
  assert.equal(smkNextOffset(0, 0, 39548, 200), null);
  const u = new URL(smkUrl(400, 200));
  assert.equal(u.searchParams.get('filters'), '[public_domain:true],[has_image:true]');
  assert.equal(u.searchParams.get('offset'), '400');
  assert.equal(smk.code, 'C3');
});

// --- National Gallery of Art (C4), CSV open data ---------------------------------------------

const ngaImages = parseCsv(readFileSync(new URL('./fixtures/nga-published_images.csv', import.meta.url), 'utf8'));
const ngaObjects = parseCsv(readFileSync(new URL('./fixtures/nga-objects.csv', import.meta.url), 'utf8'));
const ngaOpen = openImages(ngaImages);

test('NGA-CSV: Kommas, Zeilenumbrüche und doppelte Anführungszeichen in Feldern bleiben erhalten', () => {
  assert.deepEqual([...csvRows('a,b\n1,"x,y"\n"l1\nl2","q""uote"\n')], [['a', 'b'], ['1', 'x,y'], ['l1\nl2', 'q"uote']]);
  assert.deepEqual([...csvRows('a,b\r\n1,2')], [['a', 'b'], ['1', '2']]);
  assert.deepEqual([...csvRows('x,,"",y\n')], [['x', '', '', 'y']]);
  assert.deepEqual(parseCsv('﻿a,b\n1,2\n\n3,4\n'), [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  assert.deepEqual([...csvRows('')], []);
  // the real objects file has a multi-line dimensions field
  const gemel = ngaObjects.find((o) => o.objectid === '17387');
  assert.match(gemel.dimensions, /\n/);
  assert.equal(gemel.title, 'Gemel Bottle');
  assert.equal(ngaImages.length, 4);
  assert.match(ngaImages[0].assistivetext, /^The image shows/);
});

test('NGA: nur primäre Bilder mit openaccess=1 und ohne Pixelgrenze werden übernommen', () => {
  assert.deepEqual([...ngaOpen.keys()].sort(), ['17387', '30832']);
  // 223385: openaccess 0, 41526: alternate view only
  assert.equal(ngaImages.find((i) => i.depictstmsobjectid === '223385').openaccess, '0');
  assert.equal(ngaImages.find((i) => i.depictstmsobjectid === '41526').viewtype, 'alternate');
  const limited = [{ ...ngaImages[0], maxpixels: '1000' }];
  assert.equal(openImages(limited).size, 0);
  const foreign = [{ ...ngaImages[0], iiifurl: 'https://example.org/iiif/00007f61-4922-417b-8f27-893ea328206c' }];
  assert.equal(openImages(foreign).size, 0);
});

test('NGA: Objekt mit offenem Bild wird CC0-Bild mit IIIF-Vorschau, Download und Landeseite', () => {
  const it = parseNgaObject(ngaObjects.find((o) => o.objectid === '17387'), ngaOpen.get('17387'));
  valid(it);
  assert.equal(it.id, 'nga:17387');
  assert.equal(it.kind, 'bild');
  assert.match(it.sig, /^BLD·C4·/);
  assert.equal(it.license.id, 'CC0-1.0');
  assert.equal(it.title, 'Gemel Bottle');
  assert.equal(it.creator.name, 'Yolande Delasser');
  assert.equal(it.source.url, 'https://www.nga.gov/collection/art-object-page.17387.html');
  assert.equal(it.preview.thumb, 'https://api.nga.gov/iiif/00007f61-4922-417b-8f27-893ea328206c/full/!400,400/0/default.jpg');
  assert.equal(it.preview.url, 'https://api.nga.gov/iiif/00007f61-4922-417b-8f27-893ea328206c/full/!1024,1024/0/default.jpg');
  assert.equal(it.downloads[1].url, 'https://api.nga.gov/iiif/00007f61-4922-417b-8f27-893ea328206c/full/full/0/default.jpg');
  assert.equal(it.meta.abmessung, '3365 × 4332 px');
  assert.equal(it.meta.inventarnummer, '1943.8.5186');
  assert.match(it.description, /^The image shows/);
  assert.equal(it.hashes, undefined);
});

test('NGA: Bild mit openaccess=0 oder fremder Objektnummer ergibt kein Objekt', () => {
  const closed = ngaImages.find((i) => i.depictstmsobjectid === '223385');
  assert.equal(parseNgaObject(ngaObjects.find((o) => o.objectid === '223385'), closed), null);
  const obj = ngaObjects.find((o) => o.objectid === '17387');
  assert.equal(parseNgaObject(obj, ngaOpen.get('30832')), null);
  assert.equal(parseNgaObject({ ...obj, title: '  ' }, ngaOpen.get('17387')), null);
  assert.equal(parseNgaObject(obj, undefined), null);
  assert.equal(parseNgaObject(undefined, ngaOpen.get('17387')), null);
});

test('NGA-Stand: Stapel in aufsteigender Objektnummer, Fortsetzung hinter der letzten, Ende erkannt', () => {
  const b1 = nextBatch(ngaObjects, ngaOpen, 0, 1);
  assert.deepEqual(b1.items.map((i) => i.id), ['nga:17387']);
  assert.equal(b1.last, 17387);
  assert.equal(b1.done, false);
  const b2 = nextBatch(ngaObjects, ngaOpen, b1.last, 1);
  assert.deepEqual(b2.items.map((i) => i.id), ['nga:30832']);
  assert.equal(b2.done, true);
  const b3 = nextBatch(ngaObjects, ngaOpen, b2.last, 5);
  assert.deepEqual(b3.items, []);
  assert.equal(b3.done, true);
  assert.equal(b3.last, null);
  const all = nextBatch(ngaObjects, ngaOpen, 0, 10);
  assert.equal(all.items.length, 2);
  assert.equal(all.done, true);
  assert.equal(nga.code, 'C4');
});

// --- Europeana (C6), fixture rebuilt from the documentation ----------------------------------

const eu = fx('europeana-search');

test('Europeana: PDM-Objekt wird Bild mit Europeana-Vorschau und Link zum Datengeber', () => {
  const it = parseEuropeanaItem(eu.items[0]);
  valid(it);
  assert.equal(it.id, 'europeana:9200579_BibliographicResource_3000126284264');
  assert.equal(it.kind, 'bild');
  assert.match(it.sig, /^BLD·C6·/);
  assert.equal(it.license.id, 'PDM-1.0');
  assert.equal(it.creator.name, 'Beispiel, Maria');
  assert.equal(it.source.name, 'Europeana, Beispielmuseum');
  assert.equal(it.source.url, 'https://www.europeana.eu/item/9200579/BibliographicResource_3000126284264');
  assert.match(it.preview.thumb, /^https:\/\/api\.europeana\.eu\/thumbnail\//);
  assert.equal(it.downloads[0].url, 'https://example.org/media/1.jpg');
  assert.equal(it.meta.entstanden, '1890');
});

test('Europeana: CC BY 4.0 wird mit Version übernommen und verlangt Namensnennung', () => {
  const it = parseEuropeanaItem(eu.items[1]);
  valid(it);
  assert.equal(it.license.id, 'CC-BY-4.0');
  assert.equal(it.license.attribution, true);
  assert.equal(it.creator.name, 'unbekannt');
});

test('Europeana: CC BY-NC und In Copyright werden verworfen, auch bei gemischten Angaben', () => {
  assert.equal(parseEuropeanaItem(eu.items[2]), null);
  assert.equal(parseEuropeanaItem(eu.items[3]), null);
  assert.equal(parseEuropeanaItem({ ...eu.items[0], rights: ['http://creativecommons.org/publicdomain/mark/1.0/', 'http://creativecommons.org/licenses/by-nd/4.0/'] }), null);
  assert.equal(parseEuropeanaItem({ ...eu.items[0], rights: undefined }), null);
  assert.equal(parseEuropeanaItem({ ...eu.items[0], type: 'SOUND' }), null);
  assert.equal(parseEuropeanaItem({ ...eu.items[0], edmPreview: ['https://example.org/thumb.jpg'] }), null);
  assert.equal(parseEuropeanaItem({ ...eu.items[0], previewNoDistribute: true }), null);
  assert.equal(parseEuropeanaItem(null), null);
});

test('Europeana: Rechte-URLs, Anfrage und fehlender Schlüssel', async () => {
  assert.equal(europeanaLicense('http://creativecommons.org/publicdomain/zero/1.0/'), 'cc0');
  assert.equal(europeanaLicense('http://creativecommons.org/licenses/by-sa/3.0/').code, 'by-sa');
  assert.equal(europeanaLicense('http://creativecommons.org/licenses/by-nc-sa/4.0/'), null);
  assert.equal(europeanaLicense('http://rightsstatements.org/vocab/NoC-NC/1.0/'), null);
  const u = new URL(europeanaUrl({ query: '*', qf: ['TYPE:IMAGE'] }, null));
  assert.equal(u.searchParams.get('reusability'), 'open');
  assert.equal(u.searchParams.get('cursor'), '*');
  assert.equal(u.searchParams.get('qf'), 'TYPE:IMAGE');
  assert.equal(u.searchParams.get('wskey'), null);
  const logs = [];
  assert.deepEqual(await europeana.crawl({}, (m) => logs.push(m), {}), []);
  assert.match(logs[0], /EUROPEANA_API_KEY/);
  assert.equal(europeana.code, 'C6');
});
