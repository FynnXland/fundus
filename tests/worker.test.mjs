import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { vorschau } from '../worker/index.mjs';
import { schutzZuruecksetzen, ausKiNetz, begrenzt } from '../worker/schutz.mjs';
import { plan } from '../scripts/vorschau-r2.mjs';

const PFAD = 'ab/0123456789abcd.webp';
const bucket = (inhalt) => ({
  async get(k, { onlyIf } = {}) {
    if (!(k in inhalt)) return null;
    const etag = `"e-${k}"`;
    if (onlyIf?.get?.('If-None-Match') === etag) return { httpEtag: etag };
    return { httpEtag: etag, body: new Blob([inhalt[k]]).stream() };
  },
});

test('Vorschau kommt aus R2, mit Typ und Cache', async () => {
  const res = await vorschau(new Request(`https://fundus.fynn.land/vorschau/${PFAD}`), { VORSCHAU: bucket({ [PFAD]: 'bild' }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'image/webp');
  assert.match(res.headers.get('Cache-Control'), /max-age=86400/);
  assert.equal(await res.text(), 'bild');
});

test('Vorschau: fremde Pfade und fehlende Bilder sind 404, gleiche ETag ist 304', async () => {
  const env = { VORSCHAU: bucket({ [PFAD]: 'bild' }) };
  for (const p of ['../geheim', 'ab/zu-kurz.webp', 'AB/0123456789abcd.webp', 'cd/0123456789abcd.webp']) {
    assert.equal((await vorschau(new Request(`https://x/vorschau/${p}`), env)).status, 404, p);
  }
  const res = await vorschau(new Request(`https://x/vorschau/${PFAD}`, { headers: { 'If-None-Match': `"e-${PFAD}"` } }), env);
  assert.equal(res.status, 304);
  assert.equal((await vorschau(new Request(`https://x/vorschau/${PFAD}`, { method: 'POST' }), env)).status, 405);
});

test('Worker: Not-Aus und Ratenlimit sperren nur /mcp', async () => {
  const assets = { fetch: async () => new Response('seite') };
  schutzZuruecksetzen();
  const aus = { ASSETS: assets, GUARD: { state: async () => ({ panic: true }) } };
  assert.equal((await worker.fetch(new Request('https://x/mcp', { method: 'POST' }), aus)).status, 503);
  assert.equal(await (await worker.fetch(new Request('https://x/'), aus)).text(), 'seite');
  schutzZuruecksetzen();
  const voll = { ASSETS: assets, RL_MCP: { limit: async () => ({ success: false }) } };
  assert.equal((await worker.fetch(new Request('https://x/mcp', { method: 'POST' }), voll)).status, 429);
  schutzZuruecksetzen();
});

test('Ratenlimit: Anthropics Ausgangsadressen zählen im eigenen Topf', async () => {
  assert.equal(ausKiNetz('160.79.104.1'), true);
  assert.equal(ausKiNetz('160.79.111.254'), true);
  assert.equal(ausKiNetz('153.61.223.9'), true);
  assert.equal(ausKiNetz('160.79.112.1'), false);
  assert.equal(ausKiNetz('8.8.8.8'), false);
  assert.equal(ausKiNetz('2607:6bc0::1'), false);
  const genutzt = [];
  const env = {
    RL_MCP: { limit: async () => (genutzt.push('normal'), { success: true }) },
    RL_MCP_KI: { limit: async () => (genutzt.push('ki'), { success: true }) },
  };
  const anfrage = (ip) => new Request('https://x/mcp', { method: 'POST', headers: { 'CF-Connecting-IP': ip } });
  await begrenzt(env, 'RL_MCP', anfrage('160.79.104.20'));
  await begrenzt(env, 'RL_MCP', anfrage('93.184.216.34'));
  await begrenzt({ RL_MCP: env.RL_MCP }, 'RL_MCP', anfrage('160.79.104.20'));
  assert.deepEqual(genutzt, ['ki', 'normal', 'normal']);
});

test('R2-Abgleich: lädt Fehlendes und Geändertes hoch, löscht Verwaistes', () => {
  const register = { a: { pfad: 'aa/1.webp' }, b: { pfad: 'bb/2.webp' }, c: { pfad: 'cc/3.webp' }, d: { fehler: 'x' } };
  const imBucket = new Map([['aa/1.webp', 'md5-a'], ['bb/2.webp', 'alt'], ['zz/9.webp', 'weg']]);
  const lokal = { 'aa/1.webp': 'md5-a', 'bb/2.webp': 'neu', 'cc/3.webp': 'md5-c' };
  assert.deepEqual(plan(register, imBucket, (p) => lokal[p]), { hoch: ['bb/2.webp', 'cc/3.webp'], weg: ['zz/9.webp'] });
  // on CI the file is only in the bucket, not local: neither uploaded nor deleted
  assert.deepEqual(plan({ a: { pfad: 'aa/1.webp' } }, new Map([['aa/1.webp', 'x']]), () => undefined), { hoch: [], weg: [] });
});
