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

/** True when this visitor has used up the allowance of that limiter (binding in wrangler.jsonc "ratelimits"). */
export async function begrenzt(env, binding, request) {
  const limiter = env?.[binding];
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
