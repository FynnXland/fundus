// Daily allowances for /mcp, personal access keys and the hand-made grants (docs/MCP-ZUGANG-ENTWURF.md).
// Everything here is off until wrangler.jsonc sets ZUGANG to "1": the privacy texts must be live first.
//
// Who a caller is:
//   with a key (?key=… or Authorization: Bearer …)   the key's own allowance; stored is only SHA-256(key)
//   without a key, from Anthropic's addresses          one shared pool (claude.ai and Claude Desktop connectors)
//   without a key, any other address                   HMAC(secret, day | address), IPv6 cut to its /64 network
// A plain hash of an IPv4 address could be reversed by trying all of them; the HMAC with the day cannot, and it
// changes every day. Counters are one row per day and caller in D1 (binding DB, jurisdiction EU).
// If D1 fails, the caller is let through: the per-minute limit (schutz.mjs) and the panic switch still hold.
import { ausKiNetz } from './schutz.mjs';

/**
 * Calls per day. gesamtOhne caps everybody without a key together, gesamtSchluessel all keys that have no grant by
 * hand: without it, somebody who changes addresses could create keys without end and the daily total would have
 * no ceiling. Keys with a grant are outside both caps. neueSchluessel = new keys per address and day,
 * neueSchluesselGesamt = new keys per day for everybody together.
 */
export const GRENZEN = { anonym: 150, ki: 4000, browser: 300, konto: 500, gesamtOhne: 10000, gesamtSchluessel: 10000, neueSchluessel: 3, neueSchluesselGesamt: 200 };
export const SEITE = 'https://fundus.fynn.land/#/zugang';
const KONTAKT = 'Discord https://discord.gg/JTHPxAxFpE or https://fynn.land/impressum.html';
const SCHLUESSEL = /^[A-Za-z0-9_-]{32,64}$/;

export const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS zaehler (tag TEXT NOT NULL, wer TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tag, wer)) WITHOUT ROWID',
  "CREATE TABLE IF NOT EXISTS zugang (hash TEXT PRIMARY KEY, kennung TEXT NOT NULL, stufe TEXT NOT NULL DEFAULT 'browser', grenze INTEGER, gesperrt INTEGER NOT NULL DEFAULT 0, notiz TEXT, erzeugt TEXT NOT NULL, zuletzt TEXT) WITHOUT ROWID",
];

export const an = (env) => env?.ZUGANG === '1' && Boolean(env?.DB) && Boolean(env?.ZAEHLER_GEHEIM);
export const heute = (jetzt = Date.now()) => new Date(jetzt).toISOString().slice(0, 10);
const tagVor = (n, jetzt = Date.now()) => heute(jetzt - n * 864e5);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

async function hmac(geheim, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(geheim), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

/** IPv4 as it is; IPv6 only its /64 network, or one line could take a fresh allowance with every new address. */
export function netz(ip) {
  const s = String(ip || 'unbekannt').toLowerCase();
  if (!s.includes(':')) return s;
  const [vorn, hinten = ''] = s.split('::');
  const a = vorn.split(':').filter(Boolean);
  const b = hinten.split(':').filter(Boolean);
  const voll = s.includes('::') ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a;
  return voll.slice(0, 4).map((t) => t.replace(/^0+(?=.)/, '')).join(':');
}

/** The counter name of a caller without a key for one day. */
export async function ipKennung(env, ip, tag) {
  return `ip:${(await hmac(env.ZAEHLER_GEHEIM, `${tag}|${netz(ip)}`)).slice(0, 32)}`;
}

/** The key a request carries, or null. Never logged, never echoed. */
export function schluesselVon(request) {
  const k = new URL(request.url).searchParams.get('key') ?? /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1] ?? null;
  return k && SCHLUESSEL.test(k) ? k : k ? '' : null; // '' = something was sent that is no key
}

/** What a holder of a key calls it when asking for more: the first eight hex digits of its hash. */
export const kennungVon = (hash) => hash.slice(0, 8);

// Callers without a key that are over their allowance, per isolate: counter name -> day. Keys are not remembered
// here, because a grant or reset from the dashboard must take effect at once.
const ueber = new Map();
/** Tests only. */
export const vergiss = () => ueber.clear();

const zaehle = (db, tag, wer, n) => db.prepare('INSERT INTO zaehler (tag, wer, n) VALUES (?1, ?2, ?3) ON CONFLICT(tag, wer) DO UPDATE SET n = n + excluded.n RETURNING n').bind(tag, wer, n);

/**
 * Counts n calls for the caller of this request and says whether they are within the allowance.
 * Returns { erlaubt, verbraucht, grenze, stufe, kennung, grund }; grund is 'limit', 'gesamt', 'gesperrt' or
 * 'unbekannt' (a key nobody created) when erlaubt is false.
 */
export async function pruefe(env, request, n = 1, jetzt = Date.now()) {
  const offen = { erlaubt: true, verbraucht: 0, grenze: null, stufe: 'offen', kennung: null, grund: null };
  if (!an(env)) return offen;
  try {
    const tag = heute(jetzt);
    const key = schluesselVon(request);
    if (key === '') return { ...offen, erlaubt: false, stufe: 'schluessel', grund: 'unbekannt' };
    if (key) {
      const hash = await sha256(key);
      const z = await env.DB.prepare('SELECT stufe, grenze, gesperrt, zuletzt FROM zugang WHERE hash = ?1').bind(hash).first();
      const kennung = kennungVon(hash);
      if (!z) return { ...offen, erlaubt: false, stufe: 'schluessel', kennung, grund: 'unbekannt' };
      if (z.gesperrt) return { ...offen, erlaubt: false, stufe: z.stufe, kennung, grund: 'gesperrt' };
      const grenze = z.grenze ?? GRENZEN[z.stufe] ?? GRENZEN.browser;
      const lauf = [zaehle(env.DB, tag, `k:${hash.slice(0, 32)}`, n)];
      // one extra row a day, not one per call
      if (z.zuletzt !== tag) lauf.push(env.DB.prepare('UPDATE zugang SET zuletzt = ?1 WHERE hash = ?2').bind(tag, hash));
      const [r] = await env.DB.batch(lauf);
      const verbraucht = r.results[0].n;
      if (verbraucht > grenze) return { erlaubt: false, verbraucht, grenze, stufe: z.stufe, kennung, grund: 'limit' };
      // keys without a grant by hand share a ceiling; a refused call above does not count towards it
      if (z.grenze == null && (await zaehle(env.DB, tag, 'schluessel', n).first()).n > GRENZEN.gesamtSchluessel) return { erlaubt: false, verbraucht, grenze, stufe: z.stufe, kennung, grund: 'gesamt' };
      return { erlaubt: true, verbraucht, grenze, stufe: z.stufe, kennung, grund: null };
    }
    const ip = request.headers.get('CF-Connecting-IP');
    const ki = ausKiNetz(ip);
    const wer = ki ? 'ki' : await ipKennung(env, ip, tag);
    const grenze = ki ? GRENZEN.ki : GRENZEN.anonym;
    const stufe = ki ? 'ki' : 'anonym';
    // A caller already over its allowance costs no more database writes today, and above all does not count
    // towards the shared cap: one address hammering away must not use up the day for everybody else.
    if (ueber.get(wer) === tag) return { erlaubt: false, verbraucht: grenze + 1, grenze, stufe, kennung: null, grund: 'limit' };
    const verbraucht = (await zaehle(env.DB, tag, wer, n).first()).n;
    if (verbraucht > grenze) {
      if (ueber.size >= 5000) ueber.clear();
      ueber.set(wer, tag);
      return { erlaubt: false, verbraucht, grenze, stufe, kennung: null, grund: 'limit' };
    }
    const alle = (await zaehle(env.DB, tag, 'ohne', n).first()).n;
    if (alle > GRENZEN.gesamtOhne) return { erlaubt: false, verbraucht, grenze, stufe, kennung: null, grund: 'gesamt' };
    return { erlaubt: true, verbraucht, grenze, stufe, kennung: null, grund: null };
  } catch {
    return offen;
  }
}

/** The text an assistant gets instead of a result, written so that it passes it on to its user. */
export function limitText(p) {
  const mehr = `Need more for a project? Tell Fynn what you are building: ${KONTAKT}.`;
  if (p.grund === 'unbekannt') return `This Fundus access key is not known (it may have been deleted). Tell the user: create a new personal access at ${SEITE} and put its address into the assistant, or use the plain address https://fundus.fynn.land/mcp.`;
  if (p.grund === 'gesperrt') return `This Fundus access key is blocked. Tell the user to get in touch: ${KONTAKT}.`;
  if (p.grund === 'gesamt' && p.kennung) return `Fundus has reached today's ceiling for all personal accesses together (resets at 00:00 UTC). Tell the user this, do not retry now. ${mehr} Name the access ${p.kennung}.`;
  if (p.grund === 'gesamt') return `Fundus has reached today's shared allowance for callers without a personal access (resets at 00:00 UTC). Tell the user: a free personal access with its own daily allowance can be created at ${SEITE}. ${mehr}`;
  const eigen = p.stufe === 'ki'
    ? 'The allowance that all users of this assistant share without a personal access is used up for today'
    : `Daily allowance for Fundus used up (${p.grenze} calls${p.kennung ? `, access ${p.kennung}` : ''})`;
  const weg = p.kennung ? '' : ` A free personal access with its own allowance of ${GRENZEN.browser} calls a day can be created at ${SEITE}.`;
  return `${eigen}; it resets at 00:00 UTC. Tell the user this, do not retry now.${weg} ${mehr}${p.kennung ? ` Name the access ${p.kennung}.` : ''}`;
}

/** How many tool calls a JSON-RPC body holds, and their ids (a batch is an array). Anything else costs nothing. */
export function werkzeugAufrufe(body) {
  let d;
  try { d = JSON.parse(body); } catch { return []; }
  return (Array.isArray(d) ? d : [d]).filter((m) => m && m.method === 'tools/call').map((m) => m.id ?? null);
}

/** The answer for refused tool calls: a normal tool result with isError, so the assistant reads the text. */
export function limitAntwort(ids, text) {
  const eine = (id) => ({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } });
  const body = ids.length === 1 ? eine(ids[0]) : ids.map(eine);
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}

/* ---------------- The page #/zugang (same origin only) ---------------- */

const json = (daten, status = 200) => new Response(JSON.stringify(daten), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function standVon(env, hash, jetzt) {
  const z = await env.DB.prepare('SELECT kennung, stufe, grenze, gesperrt, erzeugt FROM zugang WHERE hash = ?1').bind(hash).first();
  if (!z) return null;
  const seit = tagVor(6, jetzt);
  const { results } = await env.DB.prepare('SELECT tag, n FROM zaehler WHERE wer = ?1 AND tag >= ?2 ORDER BY tag').bind(`k:${hash.slice(0, 32)}`, seit).all();
  const nach = new Map(results.map((r) => [r.tag, r.n]));
  const tage = Array.from({ length: 7 }, (_, i) => { const tag = tagVor(6 - i, jetzt); return { tag, n: nach.get(tag) ?? 0 }; });
  return { kennung: z.kennung, stufe: z.stufe, grenze: z.grenze ?? GRENZEN[z.stufe] ?? GRENZEN.browser, gesperrt: Boolean(z.gesperrt), erzeugt: z.erzeugt, heute: tage[6].n, tage };
}

/**
 * /api/zugang/info (GET), /neu, /stand, /loeschen (POST, JSON { key }). Only the site itself may call the POST
 * routes (Origin header), and a key is created only on such a call: never on loading a page.
 */
export async function api(request, env, jetzt = Date.now()) {
  const url = new URL(request.url);
  const was = url.pathname.replace(/^\/api\/zugang\/?/, '');
  if (was === 'info') return json({ an: an(env), grenzen: an(env) ? { anonym: GRENZEN.anonym, browser: GRENZEN.browser, konto: GRENZEN.konto } : null });
  if (!an(env)) return json({ fehler: 'aus' }, 404);
  if (request.method !== 'POST') return json({ fehler: 'methode' }, 405);
  if (request.headers.get('Origin') !== url.origin) return json({ fehler: 'herkunft' }, 403);
  let eingabe = {};
  try { eingabe = JSON.parse((await request.text()).slice(0, 400)); } catch { /* leer */ }
  try {
    if (was === 'neu') {
      const tag = heute(jetzt);
      const wer = `neu:${(await ipKennung(env, request.headers.get('CF-Connecting-IP'), tag)).slice(3)}`;
      const r = await zaehle(env.DB, tag, wer, 1).first();
      if (r.n > GRENZEN.neueSchluessel) return json({ fehler: 'zuviele' }, 429);
      if ((await zaehle(env.DB, tag, 'neu', 1).first()).n > GRENZEN.neueSchluesselGesamt) return json({ fehler: 'zuviele-heute' }, 429);
      const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(30)))).replace(/\+/g, '-').replace(/\//g, '_');
      const hash = await sha256(key);
      await env.DB.prepare("INSERT INTO zugang (hash, kennung, stufe, erzeugt) VALUES (?1, ?2, 'browser', ?3)").bind(hash, kennungVon(hash), tag).run();
      return json({ key, ...(await standVon(env, hash, jetzt)) });
    }
    const key = typeof eingabe.key === 'string' && SCHLUESSEL.test(eingabe.key) ? eingabe.key : null;
    if (!key) return json({ fehler: 'schluessel' }, 400);
    const hash = await sha256(key);
    if (was === 'stand') {
      const s = await standVon(env, hash, jetzt);
      return s ? json(s) : json({ fehler: 'unbekannt' }, 404);
    }
    if (was === 'loeschen') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM zugang WHERE hash = ?1').bind(hash),
        env.DB.prepare('DELETE FROM zaehler WHERE wer = ?1').bind(`k:${hash.slice(0, 32)}`),
      ]);
      return json({ ok: true });
    }
    return json({ fehler: 'pfad' }, 404);
  } catch {
    return json({ fehler: 'speicher' }, 503);
  }
}

/* ---------------- The admin dashboard (service binding, worker/admin.mjs) ---------------- */
// Plain JSON, never throws, no addresses and no account ids: the contract of fynnland-admin/docs/PROGRAMM-ANBINDEN.md.

const sicher = async (fn) => { try { return await fn(); } catch (err) { return { ok: false, fehler: String(err?.message ?? err).slice(0, 120) }; } };
const mitKennung = (kennung) => (/^[0-9a-f]{8}$/.test(String(kennung)) ? String(kennung) : null);

export const admin = {
  /** Today's calls: by tier, in total, and how many callers without a key there were. */
  counts: (env, jetzt = Date.now()) => sicher(async () => {
    const tag = heute(jetzt);
    const { results } = await env.DB.prepare("SELECT CASE WHEN wer = 'ki' THEN 'ki' WHEN wer IN ('ohne', 'schluessel', 'neu') THEN wer WHEN wer LIKE 'k:%' THEN 'zugaenge' WHEN wer LIKE 'neu:%' THEN 'neuJeAdresse' ELSE 'anonym' END AS art, COUNT(*) AS wer, SUM(n) AS n FROM zaehler WHERE tag = ?1 GROUP BY art").bind(tag).all();
    return { ok: true, an: an(env), tag, grenzen: GRENZEN, arten: Object.fromEntries(results.map((r) => [r.art, { aufrufe: r.n, zaehler: r.wer }])) };
  }),
  /** Every access key by its short name, with tier, allowance, note and today's calls. */
  list: (env, jetzt = Date.now()) => sicher(async () => {
    const tag = heute(jetzt);
    const { results } = await env.DB.prepare("SELECT z.kennung, z.stufe, z.grenze, z.gesperrt, z.notiz, z.erzeugt, z.zuletzt, COALESCE(c.n, 0) AS heute FROM zugang z LEFT JOIN zaehler c ON c.tag = ?1 AND c.wer = 'k:' || substr(z.hash, 1, 32) ORDER BY heute DESC, z.zuletzt DESC LIMIT 500").bind(tag).all();
    return { ok: true, zugaenge: results.map((r) => ({ ...r, gesperrt: Boolean(r.gesperrt), grenze: r.grenze ?? GRENZEN[r.stufe] ?? GRENZEN.browser, eigeneGrenze: r.grenze != null })) };
  }),
  /** A daily allowance of its own for one key (grenze null takes it back), with a note that names no person. */
  grant: (env, kennung, grenze, notiz = '') => sicher(async () => {
    const k = mitKennung(kennung);
    const g = grenze == null ? null : Math.floor(Number(grenze));
    if (!k || (g !== null && !(g >= 0 && g <= 1e6))) return { ok: false, fehler: 'eingabe' };
    const r = await env.DB.prepare('UPDATE zugang SET grenze = ?1, notiz = ?2 WHERE kennung = ?3').bind(g, String(notiz).slice(0, 120) || null, k).run();
    return { ok: r.meta.changes > 0, geaendert: r.meta.changes };
  }),
  /** Today's counter of one key back to zero. */
  reset: (env, kennung, jetzt = Date.now()) => sicher(async () => {
    const k = mitKennung(kennung);
    if (!k) return { ok: false, fehler: 'eingabe' };
    const r = await env.DB.prepare("DELETE FROM zaehler WHERE tag = ?1 AND wer IN (SELECT 'k:' || substr(hash, 1, 32) FROM zugang WHERE kennung = ?2)").bind(heute(jetzt), k).run();
    return { ok: true, geloescht: r.meta.changes };
  }),
  block: (env, kennung, gesperrt = true) => sicher(async () => {
    const k = mitKennung(kennung);
    if (!k) return { ok: false, fehler: 'eingabe' };
    const r = await env.DB.prepare('UPDATE zugang SET gesperrt = ?1 WHERE kennung = ?2').bind(gesperrt ? 1 : 0, k).run();
    return { ok: r.meta.changes > 0, geaendert: r.meta.changes };
  }),
};

/**
 * Once a day (cron in wrangler.jsonc): counters of callers without a key go after the following day, those of keys
 * after eight days (the page shows seven), unused browser keys without a grant after ninety days.
 */
export async function aufraeumen(env, jetzt = Date.now()) {
  if (!env?.DB) return null;
  const r = await env.DB.batch([
    env.DB.prepare("DELETE FROM zaehler WHERE tag < ?1 AND wer NOT LIKE 'k:%'").bind(tagVor(1, jetzt)),
    env.DB.prepare("DELETE FROM zaehler WHERE tag < ?1 AND wer LIKE 'k:%'").bind(tagVor(8, jetzt)),
    env.DB.prepare("DELETE FROM zugang WHERE stufe = 'browser' AND grenze IS NULL AND gesperrt = 0 AND COALESCE(zuletzt, erzeugt) < ?1").bind(tagVor(90, jetzt)),
  ]);
  return r.map((x) => x.meta.changes);
}
