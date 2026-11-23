// Picture, material and 3D sources (Wikimedia groups, museums, glTF samples) against trimmed real
// responses in tests/fixtures, plus the pure crawl-state functions (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateItem } from '../crawler/lib/schema.mjs';
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
