// fundus.fynn.land: one Cloudflare Worker for everything (wrangler.jsonc).
//   static files    dist/ (the site and the index in /data), served by the assets layer without this script
//   /vorschau/*     the 320 px previews from the R2 bucket (binding VORSCHAU), same origin, so the site's CSP stays
//                   'self' and the privacy page names one host. 50,000 files would not fit into static assets.
//   /mcp            the MCP server for AI assistants (mcp/src/worker.mjs), with rate limit and panic switch
//   /api/zugang/*   the page #/zugang: create a personal access key, see today's use (worker/zugang.mjs)
// The script only runs for /vorschau/* and /mcp ("run_worker_first"); every other request goes straight to the files.
import { begrenzt, notaus } from './schutz.mjs';
import { an as zugangAn, api as zugangApi, pruefe, limitText, limitAntwort, werkzeugAufrufe, aufraeumen } from './zugang.mjs';

const VORSCHAU_PFAD = /^\/vorschau\/([0-9a-f]{2}\/[0-9a-f]{14}\.webp)$/;
// Paths stay the same when a source swaps its picture, so a day, not forever.
const VORSCHAU_CACHE = 'public, max-age=86400';

/** A preview from R2. Only the path shape the preview run writes is accepted, so the bucket cannot be listed or probed. */
export async function vorschau(request, env, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const m = VORSCHAU_PFAD.exec(new URL(request.url).pathname);
  if (!m || !env.VORSCHAU) return new Response('Nicht gefunden', { status: 404 });
  const cache = globalThis.caches?.default;
  const schluessel = new Request(new URL(request.url).origin + new URL(request.url).pathname);
  if (cache && request.method === 'GET') {
    const treffer = await cache.match(schluessel);
    if (treffer) return treffer;
  }
  const obj = await env.VORSCHAU.get(m[1], { onlyIf: request.headers });
  if (!obj) return new Response('Nicht gefunden', { status: 404 });
  const headers = new Headers({ 'Content-Type': 'image/webp', 'Cache-Control': VORSCHAU_CACHE, ETag: obj.httpEtag, 'X-Content-Type-Options': 'nosniff' });
  // onlyIf met the visitor's If-None-Match: R2 returns the object without a body
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
  if (request.method === 'HEAD') return new Response(null, { headers });
  const antwort = new Response(obj.body, { headers });
  if (cache) ctx?.waitUntil?.(cache.put(schluessel, antwort.clone()));
  return antwort;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/vorschau/')) {
      // every preview is a Worker request: without a limit one address could fetch all 180,000 at full speed
      // (switched on together with the daily allowances, once the privacy text names this limit)
      if (env.ZUGANG === '1' && await begrenzt(env, 'RL_VORSCHAU', request)) return new Response('Zu viele Anfragen, bitte kurz warten.', { status: 429, headers: { 'Retry-After': '60' } });
      return vorschau(request, env, ctx);
    }
    if (url.pathname.startsWith('/api/zugang/')) {
      if (await begrenzt(env, 'RL_MCP', request)) return new Response('Zu viele Anfragen, bitte kurz warten.', { status: 429, headers: { 'Retry-After': '60' } });
      return zugangApi(request, env);
    }
    if (url.pathname === '/mcp') {
      if (await notaus(env)) return new Response('Fundus MCP ist gerade abgeschaltet.', { status: 503, headers: { 'Retry-After': '600' } });
      if (await begrenzt(env, 'RL_MCP', request)) return new Response('Zu viele Anfragen, bitte kurz warten.', { status: 429, headers: { 'Retry-After': '60' } });
      // Daily allowance (zugang.mjs), only for tool calls: connecting and listing the tools costs nothing. A refusal
      // is a tool result the assistant can read out, not an HTTP error it would only retry.
      if (zugangAn(env) && request.method === 'POST') {
        const ids = werkzeugAufrufe(await request.clone().text());
        if (ids.length) {
          const p = await pruefe(env, request, ids.length);
          if (!p.erlaubt) return limitAntwort(ids, limitText(p));
        }
      }
      // The MCP core reads the index through ASSETS and the previews from R2: no request leaves Cloudflare.
      const statisch = { fetch: (req) => (new URL(req.url).pathname.startsWith('/vorschau/') ? vorschau(req, env, ctx) : env.ASSETS.fetch(req)) };
      // loaded on first use: the MCP part pulls in the WebP codecs (wasm), which the site's paths never need
      const { onRequest: mcp } = await import('../mcp/src/worker.mjs');
      return mcp({ request, env: { ...env, ASSETS: statisch } });
    }
    return env.ASSETS.fetch(request);
  },
  // once a day: old counters and unused keys go (zugang.mjs aufraeumen)
  async scheduled(ereignis, env, ctx) {
    ctx.waitUntil(aufraeumen(env).catch(() => {}));
  },
};
