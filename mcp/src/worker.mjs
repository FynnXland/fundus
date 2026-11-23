// Cloudflare entry points for the remote server. The Worker variant ran under workerd (wrangler dev); the Pages
// Function variant is not tried yet (docs/stand/fundus-mcp.md).
//
// a) Pages Function next to the static site (recommended): a file functions/mcp.js in the site project with
//      export { onRequest } from '../mcp/src/worker.mjs';
//    serves https://<site>/mcp and reads the data through env.ASSETS (no extra request over the internet).
// b) Own Worker (mcp/wrangler.toml): export default below, data from FUNDUS_URL.
//
// Settings (environment variables of the Pages project or Worker):
//   FUNDUS_URL       site address for b), e.g. https://fundus.example
//   FUNDUS_VORSCHAU  preview address when the previews move (e.g. R2), default <site>/vorschau
//   KONTAKTBOGEN     "1" = draw contact sheets (decoding costs CPU time: needs the Workers Paid plan,
//                    the free plan allows 10 ms CPU per request); otherwise single previews only
import decodeWasm from '@jsquash/webp/codec/dec/webp_dec.wasm';
import encodeWasm from '@jsquash/webp/codec/enc/webp_enc.wasm';
import decode, { init as initDecode } from '@jsquash/webp/decode.js';
import encode, { init as initEncode } from '@jsquash/webp/encode.js';
import { erstelleKern } from './kern.mjs';
import { erstelleHttp } from './http.mjs';

let codecLauf = null;
const codec = () => (codecLauf ??= Promise.all([initDecode(decodeWasm), initEncode(encodeWasm)]).then(() => ({ decode, encode })));

const http = new Map(); // per isolate: one core (with its caches) per configuration
async function bedienen(request, env, holen, site) {
  const vorschau = env.FUNDUS_VORSCHAU || `${site}/vorschau`;
  const schluessel = `${site}|${vorschau}|${env.KONTAKTBOGEN}`;
  if (!http.has(schluessel)) {
    const kern = erstelleKern({ daten: `${site}/data`, vorschau, fetch: holen });
    http.set(schluessel, erstelleHttp({ kern, codec: env.KONTAKTBOGEN === '1' ? await codec() : null }));
  }
  return http.get(schluessel)(request);
}

/** a) Pages Function: same origin, static files through env.ASSETS. */
export async function onRequest({ request, env }) {
  const site = new URL(request.url).origin;
  const holen = (url, init) => (url.startsWith(`${site}/`) ? env.ASSETS.fetch(new Request(url, init)) : fetch(url, init));
  return bedienen(request, env, holen, site);
}

/** b) Own Worker on /mcp. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/mcp') return new Response('Fundus MCP: endpoint is /mcp', { status: 404 });
    if (!env.FUNDUS_URL) return new Response('FUNDUS_URL is not set', { status: 500 });
    return bedienen(request, env, (u, init) => fetch(u, init), env.FUNDUS_URL.replace(/\/+$/, ''));
  },
};
