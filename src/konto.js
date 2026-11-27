// The link to the fynn.land account for the page #/zugang (worker/zugang.mjs, routes /api/zugang/konto/…).
// Sign-in goes the way every fynn.land program does it (PKCE, sdk/README.md of fynnland-konto): the page sends the
// visitor to <hub>/konto/login with a state and the challenge, the account page sends them back to the site's address
// with ?fl_code=…&state=…, and the Worker swaps the code against a session that holds for this site only.
//
// In this browser (localStorage; both entries come into being only when the visitor presses "Mit Konto anmelden"):
//   "fundus.anmeldung"  state, verifier and time, only while the sign-in page is open: 15 minutes at most, deleted on return
//   "fundus.konto"      the session, from the exchange until "Abmelden" or "Zugang löschen" (or until it expires)
// There is no silent sign-in (prompt=none): signing in is always a deliberate click. No account name is shown or kept.
import { store } from './util.js';

const SITZUNG = 'fundus.konto';
const ANMELDUNG = 'fundus.anmeldung';
const GAME = 'fundus';
const MAX_ALTER = 15 * 60e3;

const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const zufall = (n) => base64url(crypto.getRandomValues(new Uint8Array(n)));

async function post(pfad, body) {
  const res = await fetch(`/api/zugang/${pfad}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const daten = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...daten };
}

const anmeldungLesen = () => { try { return JSON.parse(store.get(ANMELDUNG) || 'null'); } catch { return null; } };
export const sitzung = () => store.get(SITZUNG);
export const sitzungVergessen = () => store.remove(SITZUNG);

let rueckkehr = null;

/**
 * Called once before the first route. If the account page has just sent the visitor back (?fl_code=… or ?fl_error=…
 * with the state), remembers it, cleans the address and moves on to #/zugang, which is where the exchange happens.
 * The account page can only send the visitor to the site's root, so the route has to be restored here.
 */
export function rueckkehrLesen() {
  // a sign-in that was never finished leaves nothing behind for longer than its 15 minutes
  const alt = anmeldungLesen();
  if (alt && !(Date.now() - (alt.at || 0) <= MAX_ALTER)) store.remove(ANMELDUNG);
  const q = new URLSearchParams(location.search);
  if (!q.has('state') || !(q.has('fl_code') || q.has('fl_error'))) return false;
  rueckkehr = { code: q.get('fl_code'), fehler: q.get('fl_error'), state: q.get('state') };
  history.replaceState(null, '', `${location.pathname}#/zugang`);
  return true;
}

/** Sends the visitor to the sign-in page. False if the browser does not let this page keep the two values for the way. */
export async function anmelden(hub) {
  const state = zufall(16);
  const verifier = zufall(48);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  try { localStorage.setItem(ANMELDUNG, JSON.stringify({ state, verifier, at: Date.now() })); } catch { return false; }
  const url = new URL('/konto/login', hub);
  url.search = new URLSearchParams({ game: GAME, state, challenge, prompt: 'select' }).toString();
  location.assign(url.href);
  return true;
}

/**
 * Finishes a sign-in the account page has sent the visitor back from. null if there was none, else { ok: true } with the
 * session stored, or { ok: false, grund } with grund 'abgebrochen', 'anderer-tab', 'code', 'nicht-bereit' or 'konto'.
 */
export async function abschliessen() {
  if (!rueckkehr) return null;
  const { code, fehler, state } = rueckkehr;
  rueckkehr = null;
  const vorher = anmeldungLesen();
  store.remove(ANMELDUNG);
  if (!vorher || vorher.state !== state || Date.now() - (vorher.at || 0) > MAX_ALTER) return { ok: false, grund: 'anderer-tab' };
  if (!code) return { ok: false, grund: fehler === 'cancelled' ? 'abgebrochen' : 'konto' };
  const r = await post('konto/tausch', { code, verifier: vorher.verifier }).catch(() => ({ ok: false, status: 0 }));
  if (!r.ok) return { ok: false, grund: r.fehler === 'code' ? 'code' : r.fehler === 'nicht-bereit' ? 'nicht-bereit' : 'konto' };
  store.set(SITZUNG, r.session);
  return { ok: true };
}

/** With a valid session: the key from the account (or this browser's key, or a new one) and where it stands. Renews the 90 days. */
export const verbinden = (key) => post('konto/verbinden', { session: sitzung(), ...(key ? { key } : {}) }).catch(() => ({ ok: false, status: 0 }));

/** Signs out: back to the browser tier, the session ends. The key stays in the account. */
export async function abmelden(key) {
  const r = await post('konto/abmelden', { session: sitzung(), ...(key ? { key } : {}) }).catch(() => ({ ok: false, status: 0 }));
  if (r.ok) sitzungVergessen();
  return r;
}
