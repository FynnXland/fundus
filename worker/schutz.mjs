// Protection of /mcp, same pattern as fynn.land (fynnland/worker/guard.mjs, docs/SICHERHEITSPAKET.md there):
// a rate limit per visitor and the panic switch of the admin Worker fynnland-admin. Both fail open: a missing
// binding or an error here never takes the catalogue down.
//
// The limiter's key is a shortened hash of the visitor's address: nothing readable is kept, and the counter
// itself lives for the window of 60 seconds only.

const STAND_GILT = 60_000;
let stand = { um: 0, notaus: false };

async function schluessel(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unbekannt';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fundus-limit|${ip}`));
  return [...new Uint8Array(buf).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Connectors in claude.ai and Claude Desktop call from Anthropic's servers, so many people share a few addresses.
// Those addresses get their own, larger allowance (binding <name>_KI). Ranges: outbound IPv4 of
// https://platform.claude.com/docs/en/api/ip-addresses, read 26.11.2026.
const KI_NETZE = [['160.79.104.0', 21], ['153.61.208.0', 20]];

const zahl = (ip) => ip.split('.').reduce((n, t) => n * 256 + Number(t), 0);
export function ausKiNetz(ip) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip || '')) return false;
  const n = zahl(ip);
  return KI_NETZE.some(([netz, bits]) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(zahl(netz) / 2 ** (32 - bits)));
}

/** True when this visitor has used up the allowance of that limiter (binding in wrangler.jsonc "ratelimits"). */
export async function begrenzt(env, binding, request) {
  const ki = ausKiNetz(request.headers.get('CF-Connecting-IP'));
  const limiter = env?.[ki && env?.[`${binding}_KI`] ? `${binding}_KI` : binding];
  if (!limiter || typeof limiter.limit !== 'function') return false;
  try {
    const { success } = await limiter.limit({ key: await schluessel(request) });
    return success === false;
  } catch {
    return false;
  }
}

/** True while the admin Worker reports runaway cost (GUARD binding), asked at most once a minute per isolate. */
export async function notaus(env, jetzt = Date.now()) {
  if (jetzt - stand.um < STAND_GILT) return stand.notaus;
  let an = false;
  try {
    const s = await env?.GUARD?.state?.();
    an = s?.panic === true;
  } catch { /* admin Worker unreachable: stay open */ }
  stand = { um: jetzt, notaus: an };
  return an;
}

/** Tests only. */
export function schutzZuruecksetzen() {
  stand = { um: 0, notaus: false };
}
