// New kinds (video, shader): Wikimedia Commons video and Godot Shaders against trimmed real answers
// (fetched 23.11.2026), plus the pure crawl-state functions of both adapters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateItem, KINDS } from '../crawler/lib/schema.mjs';
import { unterkategorie, UNTER } from '../crawler/lib/taxonomy.mjs';
import { symbol } from '../src/symbole.js';
import * as wv from '../crawler/sources/wikimediavideo.mjs';
import * as gs from '../crawler/sources/godotshaders.mjs';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const valid = (it) => assert.deepEqual(validateItem(it), [], JSON.stringify(it, null, 1));
const page = (id) => structuredClone(fx('wikimediavideo-search').query.pages.find((p) => p.pageid === id));

test('Arten: Video und Shader haben Code, Unterordner und eigenes Zeichen', () => {
  for (const art of ['video', 'shader']) {
    assert.ok(KINDS[art]?.label && KINDS[art]?.code, art);
    assert.ok(UNTER[art]?.length > 3, art);
    assert.notEqual(symbol(art), symbol('unbekannt-xyz'), art);
  }
  const codes = Object.values(KINDS).map((k) => k.code);
  assert.equal(new Set(codes).size, codes.length, 'Codes doppelt');
});

test('Commons-Video: 1080p-WebM und MPEG-4 als Download, Poster ohne utm-Parameter, Player-WebM 480p', () => {
  const it = wv.parseVideo(page(38322846));
  valid(it);
  assert.equal(it.id, 'wikimediavideo:38322846');
  assert.equal(it.kind, 'video');
  assert.match(it.sig, /^VID·WV·/);
  assert.equal(it.license.id, 'CC-BY-SA-3.0');
  assert.equal(it.preview.type, 'image');
  assert.ok(it.preview.thumb.startsWith('https://thumb.wikimedia.org/'));
  assert.match(it.preview.url, /\/960px--/);
  for (const u of [it.preview.thumb, it.preview.url, it.preview.video.url, ...it.downloads.map((d) => d.url)]) assert.ok(!/utm_/.test(u), u);
  assert.equal(it.preview.video.type, 'video/webm');
  assert.match(it.preview.video.url, /\.480p\.vp9\.webm$/);
  assert.deepEqual(it.downloads.map((d) => d.format), ['webm', 'webm', 'mov']);
  assert.match(it.downloads[1].url, /\.1080p\.vp9\.webm$/);
  assert.match(it.downloads[2].label, /^MPEG-4 360p/);
  assert.equal(it.downloads[0].size, page(38322846).videoinfo[0].size);
  assert.equal(it.meta.dauer, '26 s');
  assert.equal(it.meta.abmessung, '1920 × 1080 px');
  assert.equal(it.hashes.sha1, page(38322846).videoinfo[0].sha1);
  assert.equal(unterkategorie(it), 'Zeitraffer');
});

test('Commons-Video: gemeinfrei ohne Lizenz-URL, Ogg-Original, ohne Umwandlungen nur das Original', () => {
  const pd = wv.parseVideo(page(40130491));
  valid(pd);
  assert.equal(pd.license.id, 'PD');
  assert.ok(!pd.tags.includes('pd usgs'));
  const ogg = wv.parseVideo(page(155108965));
  valid(ogg);
  assert.equal(ogg.downloads[0].format, 'ogv');
  const bare = wv.parseVideo(page(191309553));
  valid(bare);
  assert.equal(bare.downloads.length, 1);
  assert.equal(bare.preview.video, undefined);
});

test('Commons-Video: kein Video, NC-Lizenz und heikle Titel fallen heraus', () => {
  const p = page(38322846);
  assert.equal(wv.parseVideo({ ...p, videoinfo: [{ ...p.videoinfo[0], mediatype: 'AUDIO' }] }), null);
  const nc = page(38322846);
  nc.videoinfo[0].extmetadata.LicenseUrl.value = 'https://creativecommons.org/licenses/by-nc/4.0/';
  assert.equal(wv.parseVideo(nc), null);
  assert.equal(wv.parseVideo({ ...p, title: 'File:Bodycam Shows Officers.webm', videoinfo: [{ ...p.videoinfo[0], extmetadata: { ...p.videoinfo[0].extmetadata, ObjectName: { value: 'Bodycam Shows Officers' } } }] }), null);
  assert.ok(wv.SENSIBEL.test('Videos of nudity'));
  assert.ok(!wv.SENSIBEL.test('Waterfall in Iceland, shooting star'));
});

test('Commons-Video: Suche mit Mindestbreite, Etappen bis 10.000 Treffer je Begriff', () => {
  const p = wv.searchParams('waterfall', 100);
  assert.equal(p.gsrsearch, 'filetype:video filew:>1279 waterfall');
  assert.equal(p.gsroffset, 100);
  assert.equal(wv.searchParams('x', 0).gsroffset, undefined);

  let { state, requests } = wv.planRequests(null, ['a', 'b'], { budget: 3, heute: '2026-11-23' });
  assert.deepEqual(requests, [{ term: 'a', offset: 0 }, { term: 'b', offset: 0 }, { term: 'a', offset: 50 }]);
  state = wv.applyResult(state, 'a', { next: 50 });
  state = wv.applyResult(state, 'b', { next: undefined });
  assert.equal(state.begriffe.b.fertig, true);
  ({ requests } = wv.planRequests(state, ['a', 'b'], { budget: 2, heute: '2026-11-23' }));
  assert.deepEqual(requests, [{ term: 'a', offset: 50 }, { term: 'a', offset: 100 }]);
  state = wv.applyResult(state, 'a', { next: 10000 });
  assert.equal(state.begriffe.a.fertig, true);
  // all done: same day nothing, next day a new cycle
  assert.equal(wv.planRequests(state, ['a', 'b'], { budget: 5, heute: '2026-11-23' }).requests.length, 0);
  const next = wv.planRequests(state, ['a', 'b'], { budget: 5, heute: '2026-11-24' });
  assert.equal(next.state.zyklus, 2);
  assert.equal(next.requests[0].offset, 0);
});

test('Godot Shaders: CC0, MIT und GPL mit Code-Auszug, ohne Bild, Download als JSON-Endpunkt', () => {
  const { seiten } = fx('godotshaders');
  const cc0 = gs.parseShaderPage(seiten.cc0);
  valid(cc0);
  assert.equal(cc0.id, 'godotshaders:17403');
  assert.equal(cc0.kind, 'shader');
  assert.match(cc0.sig, /^SHD·GS·/);
  assert.equal(cc0.license.id, 'CC0-1.0');
  assert.deepEqual(cc0.creator, { name: 'LiterallyAnyone', url: 'https://godotshaders.com/author/literallyanyone/' });
  assert.equal(cc0.source.url, 'https://godotshaders.com/shader/light-enabled-3d-color-palette-material/');
  assert.equal(cc0.preview.type, 'text');
  assert.equal(cc0.preview.thumb, undefined);
  assert.equal(cc0.preview.url, undefined);
  assert.match(cc0.preview.text, /shader_type spatial;/);
  assert.ok(cc0.preview.text.split('\n').length <= 12);
  assert.deepEqual(cc0.downloads, [{ label: 'Shader-Code (JSON, Feld „code“)', url: 'https://godotshaders.com/wp-json/shader_data/shader/17403', format: 'json' }]);
  assert.equal(cc0.meta.art, 'Spatial (3D)');
  assert.equal(cc0.meta.godot, '4.4');

  const mit = gs.parseShaderPage(seiten.mit);
  valid(mit);
  assert.equal(mit.license.id, 'MIT');
  assert.equal(mit.meta.godot, '4.7');
  assert.ok(mit.tags.includes('sci fi'));
  assert.equal(unterkategorie(mit), 'Feuer & Effekte');
  // HTML entities in the code are decoded
  assert.ok(!/&gt;|&lt;|&amp;/.test(mit.preview.text));

  const gpl = gs.parseShaderPage(seiten.gnu_gpl3);
  valid(gpl);
  assert.equal(gpl.license.id, 'GPL-3.0');
});

test('Godot Shaders: Shadertoy-Port, fremde Lizenzklasse und Seite ohne Code fallen heraus', () => {
  const { seiten } = fx('godotshaders');
  assert.equal(gs.parseShaderPage(seiten.shadertoy_port), null);
  assert.equal(gs.parseShaderPage(seiten.cc0.replace('shader_license-cc0', 'shader_license-cc0 shader_license-shadertoy_port')), null);
  assert.equal(gs.parseShaderPage(seiten.cc0.replace('shader_license-cc0', '')), null);
  assert.equal(gs.parseShaderPage(seiten.cc0.replace(/<pre[\s\S]*<\/pre>/, '')), null);
  assert.equal(gs.parseShaderPage('<html></html>'), null);
});

test('Godot Shaders: Karten der Liste, Versionen, Etappen über gelesene Seiten', () => {
  const { liste } = fx('godotshaders');
  const cards = gs.parseCards(liste.mit.html);
  assert.deepEqual(cards[0], { url: 'https://godotshaders.com/shader/laser-and-lightning-beam/', slug: 'laser-and-lightning-beam', title: 'Laser and Lightning Beam', author: 'gennai' });
  assert.equal(cards.length, 2);
  assert.equal(gs.listUrl('cc0', 2), 'https://godotshaders.com/wp-json/gds/v1/shaders?shader_license=cc0&per_page=100&page=2');

  assert.equal(gs.godotVersion('godot_version-godot_version_36 godot_version-godot_version_46 godot_version-4-7'), '4.7');
  assert.equal(gs.godotVersion('shader_type-spatial'), undefined);
  assert.equal(gs.decode('a &lt; b &amp;&amp; c&#8217;s &#x2014;'), "a < b && c’s —");

  const state = { version: 1, gesehen: { 'laser-and-lightning-beam': '2026-11-23' }, listen: {} };
  const doppelt = [...cards, cards[1]];
  assert.deepEqual(gs.pickTodo(state, doppelt, 5).map((c) => c.slug), ['sword-slash-arc']);
  assert.equal(gs.pickTodo(state, doppelt, 0).length, 0);
  // first listing goes to the end, later ones stop at a page without news
  assert.equal(gs.listingDone(state, 'mit', cards, 1, 5), false);
  const komplett = { ...state, listen: { mit: { komplett: true } } };
  assert.equal(gs.listingDone(komplett, 'mit', cards, 1, 5), false);
  assert.equal(gs.listingDone({ ...komplett, gesehen: { ...state.gesehen, 'sword-slash-arc': 'aus:2026-11-23' } }, 'mit', cards, 1, 5), true);
  assert.equal(gs.listingDone(state, 'mit', [], 1, 5), true);
});

test('Godot Shaders: mehrere Läufe lesen den ganzen Bestand, unlesbare Seiten bleiben offen', async () => {
  const pages = { cc0: [0, 1, 2].map((p) => Array.from({ length: 5 }, (_, i) => ({ slug: `c${p * 5 + i}`, url: `https://godotshaders.com/shader/c${p * 5 + i}/` }))) };
  const listPage = async (l, page) => ({ cards: pages[l][page - 1] ?? [], maxPages: pages[l].length });
  let kaputt = true;
  const readPage = async (c) => (c.slug === 'c7' && kaputt ? {} : c.slug === 'c3' ? { aus: true } : { item: { id: c.slug } });
  const state = gs.emptyState();
  for (let lauf = 0; lauf < 6; lauf++) await gs.runOnce(state, { lizenzen: ['cc0'], budget: 4, heute: '2026-11-23', listPage, readPage });
  assert.equal(Object.keys(state.gesehen).length, 14);
  assert.equal(state.gesehen.c7, undefined);
  assert.equal(state.gesehen.c3, 'aus:2026-11-23');
  assert.equal(state.listen.cc0.komplett, false);
  kaputt = false;
  await gs.runOnce(state, { lizenzen: ['cc0'], budget: 4, heute: '2026-11-23', listPage, readPage });
  assert.equal(Object.keys(state.gesehen).length, 15);
  assert.equal(state.listen.cc0.komplett, true);
  assert.ok(gs.licenceRejected('<article id="post-1" class="shader type-shader shader_license-shadertoy_port">'));
  assert.ok(!gs.licenceRejected('<html>Fehler</html>'));
});
