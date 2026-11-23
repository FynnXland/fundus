// Icon adapters (OpenMoji, Twemoji, Noto Emoji, Fluent Emoji, game-icons.net, Streamline) against trimmed real data
// from 23.11.2026 (tests/fixtures/icons-*): no network, nothing is written to data/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateItem } from '../crawler/lib/schema.mjs';
import { dedupe } from '../crawler/lib/dedupe.mjs';
import { normalizeLicense } from '../crawler/lib/licenses.mjs';
import { stabileAuswahl, hatHautton, hexKey, nameKey, parseEmojiTest, titelAusDatei, unicodeText } from '../crawler/sources/icons-helfer.mjs';
import openmoji, { parseOpenmoji } from '../crawler/sources/openmoji.mjs';
import twemoji, { parseTwemoji } from '../crawler/sources/twemoji.mjs';
import notoemoji, { parseNoto } from '../crawler/sources/notoemoji.mjs';
import fluentemoji, { nachOrdner, parseFluent } from '../crawler/sources/fluentemoji.mjs';
import gameicons, { parseGameicons, parseLicenseTxt } from '../crawler/sources/gameicons.mjs';
import streamline, { parseStreamline, STILE } from '../crawler/sources/streamline.mjs';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const text = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const valid = (it) => assert.deepEqual(validateItem(it), [], JSON.stringify(it, null, 1));
const NOW = '2026-11-23T12:00:00.000Z';

const names = parseEmojiTest(text('icons-emoji-test.txt'));
const files = (tree) => tree.map(({ path, size }) => ({ path, size }));

test('Emoji-Namen: Schlüssel ohne fe0f und ohne führende Nullen, Gruppe und Untergruppe aus den Kopfzeilen', () => {
  assert.equal(hexKey('0023 FE0F 20E3'), '23-20e3');
  assert.equal(hexKey('emoji_u1f468_200d_1f4bb'), '1f468-200d-1f4bb');
  assert.equal(hexKey('1F1E9-1F1EA'), '1f1e9-1f1ea');
  assert.equal(unicodeText('23-20e3'), 'U+0023 U+20E3');
  assert.ok(hatHautton('1f44b-1f3fb') && hatHautton('emoji_u1f44b_1f3ff') && !hatHautton('1f44b'));
  const hand = names.byKey.get('1f44b');
  assert.deepEqual([hand.name, hand.group, hand.subgroup], ['waving hand', 'People & Body', 'hand-fingers-open']);
  assert.equal(names.byKey.get('1f170').name, 'A button (blood type)');
  assert.equal(names.byKey.get('23-20e3').name, 'keycap: #');
  // der Typografie-Apostroph von Unicode trifft die Schreibweise der Ordner von Microsoft
  assert.equal(nameKey('two o’clock'), nameKey('Two oclock'));
  assert.equal(names.byName.get(nameKey('Two oclock')).group, 'Travel & Places');
});

test('Helfer: Dateiname → Titel, die Auswahl je Stil ist stabil, wenn oben eine Datei dazukommt', () => {
  assert.equal(titelAusDatei('fire-alarm-2.svg'), 'Fire alarm 2');
  const l = Array.from({ length: 1000 }, (_, i) => ({ path: `core/flat/kat/icon-${String(i).padStart(4, '0')}.svg` }));
  const a = stabileAuswahl(l, 100);
  assert.equal(a.length, 100);
  assert.deepEqual(a, stabileAuswahl(l, 100), 'gleiche Liste, gleiche Wahl');
  assert.equal(stabileAuswahl(l, 5000), l);
  // eine neue Datei ganz vorn verdrängt höchstens eine Wahl (eine Position-Verteilung würde fast alle verschieben)
  const mit = stabileAuswahl([{ path: 'core/flat/aaa/neu.svg' }, ...l], 100);
  const gleich = mit.filter((x) => a.some((y) => y.path === x.path)).length;
  assert.ok(gleich >= 99, `nur ${gleich} von 100 gleich geblieben`);
});

// ---------------------------------------------------------------------------------------------

test('OpenMoji: ohne Hauttöne und Bausteine, CC BY-SA 4.0, Stiltags vorn', () => {
  const items = parseOpenmoji(fx('icons-openmoji'), {}, NOW);
  for (const it of items) valid(it);
  const ids = items.map((i) => i.id);
  assert.ok(ids.includes('openmoji:1F600') && ids.includes('openmoji:1F44B') && ids.includes('openmoji:1F1E9-1F1EA'));
  assert.ok(!ids.includes('openmoji:1F44B-1F3FB'), 'Hautton-Variante');
  assert.ok(!items.some((i) => i.meta.gruppe === 'component'), 'Baustein');
  const smile = items.find((i) => i.id === 'openmoji:1F600');
  assert.equal(smile.title, 'Grinning face');
  assert.equal(smile.license.id, 'CC-BY-SA-4.0');
  assert.equal(smile.license.shareAlike, true);
  assert.deepEqual(smile.tags.slice(0, 3), ['emoji', 'openmoji', 'smileys & gefühle']);
  assert.equal(smile.preview.thumb, 'https://raw.githubusercontent.com/hfg-gmuend/openmoji/master/color/svg/1F600.svg');
  assert.deepEqual(smile.downloads.map((d) => d.format), ['svg', 'svg', 'png']);
  assert.equal(smile.source.url, 'https://github.com/hfg-gmuend/openmoji/blob/master/color/svg/1F600.svg');
  assert.equal(smile.meta.stil, 'Emoji');
  assert.equal(smile.collection.id, 'openmoji');
  assert.match(smile.attribution, /OpenMoji/);
  assert.match(smile.attribution, /CC BY-SA 4\.0/);
  const marke = parseOpenmoji([{ hexcode: 'E040', annotation: 'Twitter', group: 'extras-openmoji', subgroups: 'brand' }], {}, NOW);
  assert.deepEqual(marke, [], 'Markenzeichen (Subgruppe brand) bleiben draußen');
  const mitHaut = parseOpenmoji(fx('icons-openmoji'), { hauttoene: true }, NOW).map((i) => i.id);
  assert.ok(mitHaut.includes('openmoji:1F44B-1F3FB'));
  assert.equal(openmoji.id, 'openmoji');
});

test('Twemoji: Namen aus Unicode, Hauttöne, Regionalbuchstaben und Nicht-SVG fallen weg', () => {
  const { items, ohneName } = parseTwemoji(files(fx('icons-twemoji-tree').tree), names, {}, NOW);
  for (const it of items) valid(it);
  const ids = items.map((i) => i.id).sort();
  assert.deepEqual(ids, ['twemoji:1f004', 'twemoji:1f170', 'twemoji:1f1e9-1f1ea', 'twemoji:1f44b', 'twemoji:1f468-200d-1f4bb', 'twemoji:1f600', 'twemoji:1f947', 'twemoji:23-20e3'].sort());
  assert.equal(ohneName, 1, '1f1e6 ist ein Regionalbuchstabe, kein Emoji');
  const hand = items.find((i) => i.id === 'twemoji:1f44b');
  assert.equal(hand.title, 'Waving hand');
  assert.equal(hand.license.id, 'CC-BY-4.0');
  assert.equal(hand.creator.name, 'Twitter, Inc. und andere Mitwirkende');
  assert.equal(hand.source.url, 'https://github.com/jdecked/twemoji/blob/main/assets/svg/1f44b.svg');
  assert.equal(hand.downloads[0].url, 'https://raw.githubusercontent.com/jdecked/twemoji/main/assets/svg/1f44b.svg');
  assert.ok(hand.tags.includes('menschen & körper'));
  assert.equal(items.find((i) => i.id === 'twemoji:23-20e3').title, 'Keycap: #');
  assert.equal(twemoji.code, 'TW');
});

test('Noto Emoji: 2D als SVG (Apache 2.0, ohne Flaggen: die gibt es dort nur als PNG), 3D als eigener Eintrag, LICENSE-Datei und Hauttöne fallen weg', () => {
  const t = fx('icons-noto-tree');
  const d2 = parseNoto(files(t.svg2d), names, '2d', {}, NOW);
  const d3 = parseNoto(files(t.png3d), names, '3d', {}, NOW);
  for (const it of [...d2.items, ...d3.items]) valid(it);
  assert.deepEqual(d2.items.map((i) => i.id).sort(), ['notoemoji:2d-1f44b', 'notoemoji:2d-1f600', 'notoemoji:2d-23-20e3']);
  assert.deepEqual(d3.items.map((i) => i.id), ['notoemoji:3d-1f600']);
  const a = d2.items.find((i) => i.id === 'notoemoji:2d-1f600');
  assert.equal(a.license.id, 'Apache-2.0');
  assert.equal(a.preview.thumb, 'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/2D/svg/emoji_u1f600.svg');
  assert.equal(a.meta.stil, 'Emoji');
  const b = d3.items[0];
  assert.equal(b.meta.stil, '3D');
  assert.equal(b.downloads[0].url, 'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/3D/png/512/emoji_u1f600.png');
  assert.notEqual(a.id, b.id);
  assert.equal(notoemoji.kinds[0], 'icon');
});

test('Fluent Emoji: ein Eintrag je Ordner, 3D-PNG als Vorschau, nur der Standard-Hautton', () => {
  const tree = files(fx('icons-fluent-tree').tree);
  assert.deepEqual([...nachOrdner(tree).keys()].sort(), ['1st place medal', 'Blackbird', 'Eight oclock', 'Grinning face', 'Waving hand']);
  const items = parseFluent(tree, names, NOW);
  for (const it of items) valid(it);
  assert.equal(items.length, 5);
  const grin = items.find((i) => i.title === 'Grinning face');
  assert.equal(grin.id, 'fluentemoji:grinning-face');
  assert.equal(grin.license.id, 'MIT');
  assert.equal(grin.preview.thumb, 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Grinning%20face/3D/grinning_face_3d.png');
  assert.deepEqual(grin.downloads.map((d) => d.format), ['png', 'svg', 'svg', 'svg']);
  assert.equal(grin.source.url, 'https://github.com/microsoft/fluentui-emoji/tree/main/assets/Grinning%20face');
  assert.equal(grin.meta.stil, '3D');
  assert.equal(grin.meta.gruppe, 'Smileys & Emotion');
  const hand = items.find((i) => i.title === 'Waving hand');
  assert.ok(hand.downloads.every((d) => /\/Default\//.test(d.url)), 'nur Default: ' + JSON.stringify(hand.downloads.map((d) => d.url)));
  assert.match(hand.downloads[0].url, /waving_hand_3d_default\.png$/);
  // "Eight oclock" heißt bei Unicode "eight o’clock": der Namensabgleich ignoriert Satzzeichen
  const acht = items.find((i) => i.title === 'Eight oclock');
  assert.ok(acht, 'Eight oclock fehlt');
  assert.equal(fluentemoji.id, 'fluentemoji');
});

test('game-icons.net: Gestalter aus license.txt, CC0 nur wo markiert, Rest CC BY 3.0', () => {
  const designers = parseLicenseTxt(text('icons-gameicons-license.txt'));
  assert.equal(designers.get('lorc').name, 'Lorc');
  assert.equal(designers.get('lorc').url, 'http://lorcblog.blogspot.com');
  assert.equal(designers.get('lorc').cc0, false);
  assert.equal(designers.get('viscious-speed'.replace(/-/g, '')).cc0, true);
  assert.equal(designers.get('zeromancer').cc0, true);
  assert.equal(designers.get('andymeneely').name, 'Andy Meneely');
  const items = parseGameicons(files(fx('icons-gameicons-tree').tree), designers, {}, NOW);
  for (const it of items) valid(it);
  const lorc = items.find((i) => i.id.startsWith('gameicons:lorc/'));
  assert.equal(lorc.license.id, 'CC-BY-3.0');
  assert.equal(lorc.creator.name, 'Lorc');
  assert.match(lorc.source.url, /^https:\/\/game-icons\.net\/1x1\/lorc\/[a-z0-9-]+\.html$/);
  assert.match(lorc.attribution, /von Lorc/);
  assert.match(lorc.attribution, /CC BY 3\.0/);
  assert.equal(items.find((i) => i.id.startsWith('gameicons:zeromancer/')).license.id, 'CC0-1.0');
  assert.equal(items.find((i) => i.id.startsWith('gameicons:viscious-speed/')).license.id, 'CC0-1.0');
  assert.ok(items.every((i) => i.meta.stil === 'Spiele' && !/\.(md|sh|txt)$/.test(i.id)), 'Dateien im Wurzelordner');
  // Ordner ohne Eintrag in license.txt: Name aus dem Ordner, Lizenz laut Kopfzeile der Datei CC BY 3.0
  const fremd = items.find((i) => i.id.startsWith('gameicons:various-artists/'));
  if (fremd) assert.equal(fremd.license.id, 'CC-BY-3.0');
  assert.equal(gameicons.code, 'GI');
});

test('Streamline: nur die freigegebenen Stile, Logos und Memes nicht, Obergrenze je Stil, CC BY 4.0 mit Link', () => {
  const tree = files(fx('icons-streamline-tree').tree);
  const alle = parseStreamline(tree, {}, NOW);
  for (const it of alle) valid(it);
  const pfade = alle.map((i) => i.id.replace('streamline:', ''));
  assert.ok(pfade.some((p) => p.startsWith('core/flat/')) && pfade.some((p) => p.startsWith('pixel/')) && pfade.some((p) => p.startsWith('freebies-freemojis/')));
  assert.ok(!pfade.some((p) => /^(logos|nasty-icons|memes|core\/line)\//.test(p)), 'nicht freigegebene Familie: ' + pfade.filter((p) => /^(logos|nasty|memes|core\/line)/.test(p)));
  const klein = parseStreamline(tree, { jeStil: 5 }, NOW).filter((i) => i.meta.serie === 'Core Flat');
  assert.equal(klein.length, 5);
  assert.ok(klein.every((i) => i.id.startsWith('streamline:core/flat/')));
  const eins = alle[0];
  assert.equal(eins.license.id, 'CC-BY-4.0');
  assert.equal(eins.creator.url, 'https://streamlinehq.com');
  assert.equal(eins.meta.stil, 'Farbig');
  assert.equal(eins.tags[0], 'farbig');
  assert.match(eins.preview.thumb, /^https:\/\/raw\.githubusercontent\.com\/webalys-hq\/streamline-vectors\/main\/core\/flat\//);
  const pix = alle.find((i) => i.meta.serie === 'Pixel');
  assert.equal(pix.meta.stil, 'Pixel');
  assert.ok(pix.meta.bereich, 'Kategorie als Bereich');
  assert.ok(STILE.every((s) => !/line|solid|remix|logos|memes/.test(s.pfad.split('/').at(-1))), 'Allowlist enthält keinen einfarbigen Stil');
  assert.equal(streamline.code, 'SL');
});

// ---------------------------------------------------------------------------------------------

test('Alle Adapter zusammen: gültig, eindeutige Kennung, Landeseite und erster Download, Dedupe verschmilzt nichts', () => {
  const t = fx('icons-noto-tree');
  const designers = parseLicenseTxt(text('icons-gameicons-license.txt'));
  const alle = [
    ...parseOpenmoji(fx('icons-openmoji'), { hauttoene: true }, NOW),
    ...parseTwemoji(files(fx('icons-twemoji-tree').tree), names, {}, NOW).items,
    ...parseNoto(files(t.svg2d), names, '2d', {}, NOW).items,
    ...parseNoto(files(t.png3d), names, '3d', {}, NOW).items,
    ...parseFluent(files(fx('icons-fluent-tree').tree), names, NOW),
    ...parseGameicons(files(fx('icons-gameicons-tree').tree), designers, {}, NOW),
    ...parseStreamline(files(fx('icons-streamline-tree').tree), {}, NOW),
  ];
  assert.ok(alle.length > 60);
  for (const it of alle) valid(it);
  for (const feld of [(i) => i.id, (i) => i.source.url, (i) => i.downloads[0].url, (i) => i.preview.thumb, (i) => i.sig]) {
    assert.equal(new Set(alle.map(feld)).size, alle.length);
  }
  assert.equal(dedupe(alle).length, alle.length, 'dedupe darf keinen Icon-Eintrag verschlucken');
  assert.ok(alle.every((i) => i.kind === 'icon' && i.preview.type === 'image'));
  // nur Lizenzen der Whitelist, nichts mit NC oder ND
  for (const it of alle) {
    assert.ok(normalizeLicense(it.license.id), it.license.id);
    assert.ok(!/NC|ND/.test(it.license.id), it.license.id);
  }
  // alle Bilder und Downloads liegen bei raw.githubusercontent.com (kein neuer Host für VORSCHAU_HOSTS)
  const hosts = new Set(alle.flatMap((i) => [i.preview.thumb, ...i.downloads.map((d) => d.url)]).map((u) => new URL(u).host));
  assert.deepEqual([...hosts], ['raw.githubusercontent.com']);
});

test('Lizenzen mit NC oder ND bleiben draußen, auch wenn ein Adapter sie läse', () => {
  for (const l of ['CC-BY-NC-4.0', 'CC-BY-ND-4.0', 'CC-BY-NC-SA-4.0']) assert.equal(normalizeLicense(l), null);
});

// ---------------------------------------------------------------------------------------------
// crawl() mit nachgestelltem Netz

async function mitNetz(antworten, fn) {
  const echt = globalThis.fetch;
  const aufrufe = [];
  globalThis.fetch = async (url) => {
    aufrufe.push(String(url));
    for (const [muster, antwort] of antworten) {
      if (String(url).includes(muster)) return typeof antwort === 'string' ? new Response(antwort, { status: 200 }) : new Response(JSON.stringify(antwort.body ?? antwort), { status: antwort.status ?? 200 });
    }
    return new Response('nicht gefunden', { status: 404 });
  };
  try { return await fn(aufrufe); } finally { globalThis.fetch = echt; }
}
const stumm = () => {};

test('crawl(): Streamline mit abgeschnittener Dateiliste liefert nichts statt einer halben Liste', async () => {
  const tree = { truncated: true, tree: fx('icons-streamline-tree').tree };
  const out = await mitNetz([['git/trees/', tree]], () => streamline.crawl({}, stumm));
  assert.deepEqual(out, []);
});

test('crawl(): OpenMoji mit Mini-Budget, eine Anfrage an raw.githubusercontent.com', async () => {
  const out = await mitNetz([['data/openmoji.json', fx('icons-openmoji')]], async (aufrufe) => {
    const r = await openmoji.crawl({ limit: 2 }, stumm);
    assert.equal(aufrufe.length, 1);
    return r;
  });
  assert.equal(out.length, 2);
  for (const it of out) valid(it);
});

test('crawl(): Twemoji ohne Namensliste von unicode.org liefert nichts (keine namenlosen Einträge)', async () => {
  const out = await mitNetz([['git/trees/', fx('icons-twemoji-tree')], ['emoji-test.txt', { status: 404, body: {} }]], () => twemoji.crawl({}, stumm));
  assert.deepEqual(out, []);
});
