// Dedupe, link checker and publishing, without network: the link checker runs against a local server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { dedupe, normalizeUrl } from '../crawler/lib/dedupe.mjs';
import { probe, nextStatus, urlsOf, BROKEN_AFTER } from '../crawler/check-links.mjs';
import { publishable } from '../crawler/publish.mjs';
import { makeItem } from '../crawler/lib/item.mjs';
import { merge } from '../crawler/crawl.mjs';

const src = { id: 'test', code: 'TS', name: 'Testquelle' };
const item = (over = {}) =>
  makeItem(src, {
    sourceId: 'a',
    kind: 'bild',
    title: 'Testbild',
    creator: { name: 'Ana' },
    landing: 'https://example.org/a',
    license: 'cc0',
    preview: { type: 'image', thumb: 'https://example.org/a-thumb.jpg', url: 'https://example.org/a.jpg' },
    downloads: [{ label: 'Original', url: 'https://example.org/a.jpg' }],
    ...over,
  });

test('normalizeUrl: Commons-Varianten und Query bleiben unterscheidbar', () => {
  assert.equal(normalizeUrl('https://commons.wikimedia.org/wiki/Datei:Foo bar.jpg'), normalizeUrl('https://commons.m.wikimedia.org/wiki/File:Foo_bar.jpg'));
  assert.notEqual(normalizeUrl('https://ambientcg.com/get?file=A.zip'), normalizeUrl('https://ambientcg.com/get?file=B.zip'));
});

test('dedupe: direkte Quelle schlägt Aggregator, via wird übernommen', () => {
  const direkt = item({ sourceId: 'direkt' });
  const ueberOpenverse = { ...item({ sourceId: 'ov', landing: 'https://example.org/anders' }), via: ['Openverse'] };
  const out = dedupe([ueberOpenverse, direkt]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'test:direkt');
  assert.deepEqual(out[0].via, ['Openverse']);
});

test('merge: firstSeen bleibt beim erneuten Crawl erhalten, alte Einträge bleiben', () => {
  const alt = { ...item({ sourceId: 'x', landing: 'https://example.org/x', downloads: [{ label: 'O', url: 'https://example.org/x.jpg' }] }), firstSeen: '2026-01-01T00:00:00.000Z' };
  const nochDa = item({ sourceId: 'y', landing: 'https://example.org/y', downloads: [{ label: 'O', url: 'https://example.org/y.jpg' }] });
  const neu = item({ sourceId: 'x', landing: 'https://example.org/x', downloads: [{ label: 'O', url: 'https://example.org/x.jpg' }] });
  const out = merge([alt, nochDa], [neu]);
  assert.equal(out.length, 2);
  assert.equal(out.find((i) => i.id === 'test:x').firstSeen, '2026-01-01T00:00:00.000Z');
});

let server;
let base;
before(async () => {
  server = createServer((req, res) => {
    if (req.url === '/ok') return res.writeHead(200).end('x');
    if (req.url === '/kein-head') return req.method === 'HEAD' ? res.writeHead(405).end() : res.writeHead(206).end('x');
    if (req.url === '/bremse') return res.writeHead(429).end();
    if (req.url === '/weiter') return res.writeHead(302, { Location: '/ok' }).end();
    return res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('probe: 200, Weiterleitung, HEAD verweigert, 404', async () => {
  assert.equal((await probe(`${base}/ok`)).ok, true);
  assert.equal((await probe(`${base}/weiter`)).ok, true);
  assert.equal((await probe(`${base}/kein-head`)).ok, true);
  assert.equal((await probe(`${base}/bremse`)).ok, null);
  const tot = await probe(`${base}/weg`);
  assert.equal(tot.ok, false);
  assert.equal(tot.status, 404);
});

test('nextStatus: erst nach zwei Fehlläufen in Folge ausgeblendet, Erfolg setzt zurück', () => {
  const fail = [{ role: 'download', url: 'u', ok: false, status: 404 }];
  const s1 = nextStatus(undefined, fail);
  assert.equal(s1.broken, false);
  const s2 = nextStatus(s1, fail);
  assert.equal(s2.fails, BROKEN_AFTER);
  assert.equal(s2.broken, true);
  const s3 = nextStatus(s2, [{ role: 'download', url: 'u', ok: true, status: 200 }]);
  assert.equal(s3.broken, false);
  assert.equal(s3.fails, 0);
});

test('nextStatus: 429 zählt weder als Fehler noch setzt es den Zähler zurück', () => {
  const s1 = nextStatus(undefined, [{ role: 'download', url: 'u', ok: false, status: 404 }]);
  const s2 = nextStatus(s1, [{ role: 'download', url: 'u', ok: null, status: 429 }]);
  assert.equal(s2.fails, 1);
  assert.equal(s2.broken, false);
});

test('urlsOf: jede Adresse nur einmal', () => {
  const urls = urlsOf(item()).map((u) => u.url);
  assert.deepEqual(urls, ['https://example.org/a', 'https://example.org/a-thumb.jpg', 'https://example.org/a.jpg']);
});

test('urlsOf: GitHub-Dateiseite entfällt, wenn dieselbe Datei roh geprüft wird', () => {
  const blob = 'https://github.com/jdecked/twemoji/blob/main/assets/svg/1f004.svg';
  const roh = 'https://raw.githubusercontent.com/jdecked/twemoji/main/assets/svg/1f004.svg';
  const it = { source: { url: blob }, preview: { thumb: roh }, downloads: [{ url: roh }] };
  assert.deepEqual(urlsOf(it), [{ role: 'vorschaubild', url: roh }]);
  const anders = { source: { url: blob }, preview: { thumb: 'https://example.org/x.png' }, downloads: [] };
  assert.equal(urlsOf(anders)[0].url, blob);
});

test('publishable: kaputte, gesperrte und ungültige Einträge bleiben draußen', () => {
  const gut = item({ sourceId: 'gut' });
  const kaputt = item({ sourceId: 'kaputt' });
  const gesperrt = item({ sourceId: 'gesperrt' });
  const ungueltig = { ...item({ sourceId: 'kaputt2' }), title: '' };
  const { items, skipped } = publishable({ items: [gut, kaputt, gesperrt, ungueltig] }, { 'test:kaputt': { broken: true } }, { 'test:gesperrt': 'Meldung' });
  assert.deepEqual(items.map((i) => i.id), ['test:gut']);
  assert.deepEqual(skipped, { ungueltig: 1, kaputt: 1, gesperrt: 1 });
});

test('inhaltsDubletten: gleiche Prüfsumme führt zusammen, ähnliche Vorschau-Kugeln nicht', async () => {
  const { inhaltsDubletten } = await import('../crawler/lib/dedupe.mjs');
  const a = { ...item({ sourceId: 'a1', landing: 'https://example.org/a1', downloads: [{ label: 'O', url: 'https://example.org/a1.jpg' }] }), hashes: { sha1: 'ABC' } };
  const b = { ...item({ sourceId: 'b1', landing: 'https://example.org/b1', downloads: [{ label: 'O', url: 'https://example.org/b1.jpg' }] }), hashes: { sha1: 'abc' }, via: ['Openverse'] };
  const m1 = { ...item({ sourceId: 'm1', kind: 'textur', landing: 'https://example.org/m1', downloads: [{ label: 'O', url: 'https://example.org/m1.zip' }] }) };
  const m2 = { ...item({ sourceId: 'm2', kind: 'textur', landing: 'https://example.org/m2', downloads: [{ label: 'O', url: 'https://example.org/m2.zip' }] }) };
  const gleich = { dhash: '0f0f3c3c0f0f3c3c', b: 320, h: 320 };
  const { items, zusammengefuehrt } = inhaltsDubletten([a, b, m1, m2], { 'test:m1': gleich, 'test:m2': gleich });
  assert.equal(zusammengefuehrt, 1);
  assert.equal(items.length, 3);
  const sieger = items.find((i) => i.auch);
  assert.equal(sieger.id, 'test:a1');
  assert.equal(sieger.auch[0].id, 'test:b1');
});

test('inhaltsDubletten: gleiches Foto bei zwei Quellen wird erkannt, bei derselben Quelle nicht', async () => {
  const { inhaltsDubletten } = await import('../crawler/lib/dedupe.mjs');
  const foto = (id, quelle) => ({ ...item({ sourceId: id, landing: `https://example.org/${id}`, downloads: [{ label: 'O', url: `https://example.org/${id}.jpg` }] }), source: { id: 'test', name: quelle, url: `https://example.org/${id}` } });
  const v = { dhash: '0f0f3c3c0f0f3c3c', b: 320, h: 213 };
  const fast = { dhash: '0f0f3c3c0f0f3c3d', b: 320, h: 213 };
  const r = inhaltsDubletten([foto('x', 'Commons'), foto('y', 'Flickr')], { 'test:x': v, 'test:y': fast });
  assert.equal(r.zusammengefuehrt, 1);
  const gleicheQuelle = inhaltsDubletten([foto('x', 'Commons'), foto('z', 'Commons')], { 'test:x': v, 'test:z': v });
  assert.equal(gleicheQuelle.zusammengefuehrt, 0);
});

test('gedrosselteHosts: Massen-403 eines Servers wird unklar, einzelne 404 bleiben Fehler', async () => {
  const { gedrosselteHosts } = await import('../crawler/check-links.mjs');
  const alle = [
    ...Array.from({ length: 12 }, (_, i) => ({ url: `https://bilder.example/${i}.jpg`, ok: false, status: 403 })),
    ...Array.from({ length: 8 }, (_, i) => ({ url: `https://bilder.example/ok${i}.jpg`, ok: true, status: 200 })),
    { url: 'https://andere.example/weg.jpg', ok: false, status: 404 },
    { url: 'https://andere.example/einzeln.jpg', ok: false, status: 403 },
  ];
  assert.deepEqual(gedrosselteHosts(alle), ['bilder.example']);
  assert.equal(alle[0].ok, null);
  assert.equal(alle.at(-1).ok, false);
  assert.equal(alle.at(-2).ok, false);
});
