// Daily allowances, access keys and grants (worker/zugang.mjs), against a real SQLite in memory behind the
// handful of D1 methods the code uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/index.mjs';
import { beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { SCHEMA, SCHEMA_KONTO, KONTO_TAGE, kontoAn, wirkStufe, GRENZEN, pruefe, api, admin, aufraeumen, netz, limitText, werkzeugAufrufe, schluesselVon, sha256, kennungVon, vergiss } from '../worker/zugang.mjs';
beforeEach(() => vergiss());

function d1() {
  const db = new DatabaseSync(':memory:');
  for (const s of SCHEMA) db.exec(s);
  const lauf = (sql, args) => {
    const p = db.prepare(sql);
    if (/^\s*SELECT|RETURNING/i.test(sql)) return { results: p.all(...args).map((r) => ({ ...r })), meta: { changes: 0 } };
    return { results: [], meta: { changes: Number(p.run(...args).changes) } };
  };
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => lauf(sql, args).results[0] ?? null,
    all: async () => lauf(sql, args),
    run: async () => lauf(sql, args),
    jetzt: () => lauf(sql, args),
  });
  return { prepare: (sql) => stmt(sql), batch: async (liste) => liste.map((s) => s.jetzt()), roh: db };
}

const umgebung = () => ({ ZUGANG: '1', ZAEHLER_GEHEIM: 'nur-im-test', DB: d1() });
const TAG1 = Date.parse('2026-12-01T10:00:00Z');
const TAG2 = Date.parse('2026-12-02T00:00:05Z');
const anfrage = (ip, key, kopf = {}) => new Request(`https://fundus.fynn.land/mcp${key ? `?key=${key}` : ''}`, { method: 'POST', headers: { 'CF-Connecting-IP': ip, ...kopf } });
const seite = (pfad, ip, body) => new Request(`https://fundus.fynn.land/api/zugang/${pfad}`, { method: 'POST', headers: { 'CF-Connecting-IP': ip, Origin: 'https://fundus.fynn.land', 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });

test('ausgeschaltet: niemand wird gezählt, nichts gespeichert', async () => {
  const env = { ...umgebung(), ZUGANG: '0' };
  const p = await pruefe(env, anfrage('203.0.113.7'), 5, TAG1);
  assert.equal(p.erlaubt, true);
  assert.equal(env.DB.roh.prepare('SELECT COUNT(*) AS n FROM zaehler').get().n, 0);
  assert.equal((await api(seite('neu', '203.0.113.7'), env)).status, 404);
  assert.deepEqual(await (await api(new Request('https://fundus.fynn.land/api/zugang/info'), env)).json(), { an: false, konto: false, grenzen: null });
});

test('ohne Schlüssel: Tagesgrenze je Adresse, am nächsten Tag wieder frei', async () => {
  const env = umgebung();
  let p;
  for (let i = 0; i < GRENZEN.anonym; i++) p = await pruefe(env, anfrage('203.0.113.7'), 1, TAG1);
  assert.deepEqual([p.erlaubt, p.verbraucht, p.grenze, p.stufe], [true, 150, 150, 'anonym']);
  p = await pruefe(env, anfrage('203.0.113.7'), 1, TAG1);
  assert.deepEqual([p.erlaubt, p.grund], [false, 'limit']);
  assert.match(limitText(p), /150 calls.*00:00 UTC.*#\/zugang.*discord\.gg/s);
  assert.equal((await pruefe(env, anfrage('203.0.113.8'), 1, TAG1)).erlaubt, true, 'eine andere Adresse hat ihr eigenes Kontingent');
  assert.equal((await pruefe(env, anfrage('203.0.113.7'), 1, TAG2)).verbraucht, 1, 'neuer Tag, neuer Zähler');
});

test('gespeichert wird keine Adresse, nur ein Schlüssel-Hash mit Tag; IPv6 zählt als /64-Netz', async () => {
  const env = umgebung();
  await pruefe(env, anfrage('203.0.113.7'), 1, TAG1);
  const zeilen = env.DB.roh.prepare('SELECT wer FROM zaehler').all().map((r) => r.wer);
  assert.ok(zeilen.every((w) => !w.includes('203.0.113')));
  assert.ok(zeilen.some((w) => /^ip:[0-9a-f]{32}$/.test(w)));
  assert.equal(netz('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), netz('2001:db8:1:2::1'));
  assert.equal(netz('2001:0db8:0001:0002::1'), '2001:db8:1:2');
  assert.notEqual(netz('2001:db8:1:3::1'), netz('2001:db8:1:2::1'));
  await pruefe(env, anfrage('2001:db8:1:2::1'), 1, TAG1);
  assert.equal((await pruefe(env, anfrage('2001:db8:1:2:9:9:9:9'), 1, TAG1)).verbraucht, 2, 'gleicher Anschluss, andere Adresse');
});

test('Anthropics Adressen teilen einen Topf; der Deckel für alle ohne Schlüssel greift', async () => {
  const env = umgebung();
  const a = await pruefe(env, anfrage('160.79.104.10'), 1, TAG1);
  const b = await pruefe(env, anfrage('160.79.105.20'), 1, TAG1);
  assert.deepEqual([a.stufe, b.verbraucht, b.grenze], ['ki', 2, GRENZEN.ki]);
  const vorher = GRENZEN.gesamtOhne;
  GRENZEN.gesamtOhne = 3;
  try {
    await pruefe(env, anfrage('198.51.100.1'), 1, TAG1);
    const p = await pruefe(env, anfrage('198.51.100.2'), 1, TAG1);
    assert.deepEqual([p.erlaubt, p.grund], [false, 'gesamt']);
    assert.match(limitText(p), /shared allowance.*#\/zugang/s);
  } finally { GRENZEN.gesamtOhne = vorher; }
});

test('persönlicher Zugang: nur von der eigenen Seite, höchstens drei am Tag, eigenes Kontingent', async () => {
  const env = umgebung();
  const fremd = new Request('https://fundus.fynn.land/api/zugang/neu', { method: 'POST', headers: { Origin: 'https://boese.example', 'CF-Connecting-IP': '203.0.113.7' } });
  assert.equal((await api(fremd, env, TAG1)).status, 403);
  const neu = await (await api(seite('neu', '203.0.113.7'), env, TAG1)).json();
  assert.match(neu.key, /^[A-Za-z0-9_-]{40}$/);
  assert.deepEqual([neu.stufe, neu.grenze, neu.heute, neu.tage.length], ['browser', 300, 0, 7]);
  assert.equal(neu.kennung, kennungVon(await sha256(neu.key)));
  assert.ok(!JSON.stringify(env.DB.roh.prepare('SELECT * FROM zugang').all()).includes(neu.key), 'der Schlüssel selbst liegt nicht in der Datenbank');
  await api(seite('neu', '203.0.113.7'), env, TAG1);
  await api(seite('neu', '203.0.113.7'), env, TAG1);
  assert.equal((await api(seite('neu', '203.0.113.7'), env, TAG1)).status, 429);

  // the key counts for itself, whatever address the assistant calls from, also as a Bearer token
  let p = await pruefe(env, anfrage('160.79.104.10', neu.key), 2, TAG1);
  assert.deepEqual([p.erlaubt, p.verbraucht, p.grenze, p.kennung], [true, 2, 300, neu.kennung]);
  p = await pruefe(env, anfrage('198.51.100.9', null, { Authorization: `Bearer ${neu.key}` }), 1, TAG1);
  assert.equal(p.verbraucht, 3);
  assert.equal(env.DB.roh.prepare("SELECT COUNT(*) AS n FROM zaehler WHERE wer = 'ohne'").get().n, 0, 'Aufrufe mit Schlüssel zählen nicht in den Gesamtdeckel');
  const stand = await (await api(seite('stand', '203.0.113.7', { key: neu.key }), env, TAG1)).json();
  assert.deepEqual([stand.heute, stand.tage[6]], [3, { tag: '2026-12-01', n: 3 }]);

  const unbekannt = await pruefe(env, anfrage('198.51.100.9', 'x'.repeat(40)), 1, TAG1);
  assert.deepEqual([unbekannt.erlaubt, unbekannt.grund], [false, 'unbekannt']);
  assert.equal(schluesselVon(anfrage('1.1.1.1', 'zu-kurz')), '', 'etwas, das kein Schlüssel ist, wird nicht still als „ohne Schlüssel“ gezählt');

  assert.deepEqual(await (await api(seite('loeschen', '203.0.113.7', { key: neu.key }), env, TAG1)).json(), { ok: true });
  assert.equal((await pruefe(env, anfrage('198.51.100.9', neu.key), 1, TAG1)).grund, 'unbekannt');
});

test('Freigabe von Hand: Grenze setzen, zurücksetzen, sperren; nie eine Ausnahme nach außen', async () => {
  const env = umgebung();
  const { key, kennung } = await (await api(seite('neu', '203.0.113.7'), env, TAG1)).json();
  await pruefe(env, anfrage('198.51.100.9', key), 300, TAG1);
  assert.equal((await pruefe(env, anfrage('198.51.100.9', key), 1, TAG1)).grund, 'limit');
  assert.deepEqual(await admin.grant(env, kennung, 5000, 'Spielprojekt'), { ok: true, geaendert: 1 });
  let p = await pruefe(env, anfrage('198.51.100.9', key), 1, TAG1);
  assert.deepEqual([p.erlaubt, p.grenze], [true, 5000]);
  const liste = await admin.list(env, TAG1);
  assert.deepEqual([liste.zugaenge[0].kennung, liste.zugaenge[0].heute, liste.zugaenge[0].grenze, liste.zugaenge[0].notiz, liste.zugaenge[0].eigeneGrenze], [kennung, 302, 5000, 'Spielprojekt', true]);
  assert.ok(!JSON.stringify(liste).includes(key) && !('hash' in liste.zugaenge[0]), 'das Dashboard sieht weder Schlüssel noch Hash');
  assert.equal((await admin.reset(env, kennung, TAG1)).geloescht, 1);
  assert.equal((await pruefe(env, anfrage('198.51.100.9', key), 1, TAG1)).verbraucht, 1);
  await admin.block(env, kennung, true);
  p = await pruefe(env, anfrage('198.51.100.9', key), 1, TAG1);
  assert.deepEqual([p.erlaubt, p.grund], [false, 'gesperrt']);
  await admin.block(env, kennung, false);
  assert.equal((await pruefe(env, anfrage('198.51.100.9', key), 1, TAG1)).erlaubt, true);
  const zahlen = await admin.counts(env, TAG1);
  assert.equal(zahlen.arten.zugaenge.zaehler, 1);
  assert.deepEqual(await admin.grant(env, 'nicht-hex', 5), { ok: false, fehler: 'eingabe' });
  assert.equal((await admin.list({})).ok, false, 'ohne Datenbank eine Antwort, kein Wurf');
});

test('fällt die Datenbank aus, bleibt der Zugang offen', async () => {
  const env = { ZUGANG: '1', ZAEHLER_GEHEIM: 'x', DB: { prepare() { throw new Error('D1 weg'); }, batch() { throw new Error('D1 weg'); } } };
  assert.equal((await pruefe(env, anfrage('203.0.113.7'), 1, TAG1)).erlaubt, true);
});

test('aufräumen: fremde Zähler nach einem Tag, die der Schlüssel nach acht, ungenutzte Schlüssel nach neunzig', async () => {
  const env = umgebung();
  const { key } = await (await api(seite('neu', '203.0.113.7'), env, TAG1)).json();
  await pruefe(env, anfrage('203.0.113.7'), 1, TAG1);
  await pruefe(env, anfrage('198.51.100.9', key), 1, TAG1);
  const tage = (n) => TAG1 + n * 864e5;
  await aufraeumen(env, tage(1));
  assert.equal(env.DB.roh.prepare("SELECT COUNT(*) AS n FROM zaehler WHERE wer LIKE 'ip:%'").get().n, 1, 'gestern bleibt');
  await aufraeumen(env, tage(2));
  assert.equal(env.DB.roh.prepare("SELECT COUNT(*) AS n FROM zaehler WHERE wer NOT LIKE 'k:%'").get().n, 0);
  assert.equal(env.DB.roh.prepare("SELECT COUNT(*) AS n FROM zaehler WHERE wer LIKE 'k:%'").get().n, 1);
  await aufraeumen(env, tage(9));
  assert.equal(env.DB.roh.prepare('SELECT COUNT(*) AS n FROM zaehler').get().n, 0);
  assert.equal(env.DB.roh.prepare('SELECT COUNT(*) AS n FROM zugang').get().n, 1);
  await aufraeumen(env, tage(91));
  assert.equal(env.DB.roh.prepare('SELECT COUNT(*) AS n FROM zugang').get().n, 0);
});

test('Worker: nur Werkzeug-Aufrufe zählen, die Absage ist ein lesbares Werkzeug-Ergebnis', async () => {
  assert.deepEqual(werkzeugAufrufe('{"jsonrpc":"2.0","id":1,"method":"tools/list"}'), []);
  assert.deepEqual(werkzeugAufrufe('[{"id":4,"method":"tools/call"},{"id":5,"method":"tools/call"},{"method":"notifications/initialized"}]'), [4, 5]);
  assert.deepEqual(werkzeugAufrufe('kein json'), []);
  const env = umgebung();
  const vorher = GRENZEN.anonym;
  GRENZEN.anonym = 1;
  try {
    await pruefe(env, anfrage('203.0.113.7'), 1);
    const res = await worker.fetch(new Request('https://fundus.fynn.land/mcp', { method: 'POST', headers: { 'CF-Connecting-IP': '203.0.113.7', 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"fundus_search","arguments":{}}}' }), env, {});
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.deepEqual([d.id, d.result.isError], [7, true]);
    assert.match(d.result.content[0].text, /Daily allowance.*Tell the user/s);
  } finally { GRENZEN.anonym = vorher; }
});

test('wer sein Kontingent überzogen hat, verbraucht nicht den Deckel für alle und kostet keine Schreibvorgänge mehr', async () => {
  const env = umgebung();
  await pruefe(env, anfrage('203.0.113.7'), GRENZEN.anonym, TAG1);
  const ohne = () => env.DB.roh.prepare("SELECT n FROM zaehler WHERE wer = 'ohne'").get().n;
  assert.equal(ohne(), GRENZEN.anonym);
  for (let i = 0; i < 50; i++) assert.equal((await pruefe(env, anfrage('203.0.113.7'), 1, TAG1)).grund, 'limit');
  assert.equal(ohne(), GRENZEN.anonym, 'abgewiesene Aufrufe zählen nicht in den Gesamtdeckel');
  const eigen = env.DB.roh.prepare("SELECT n FROM zaehler WHERE wer LIKE 'ip:%'").get().n;
  assert.equal(eigen, GRENZEN.anonym + 1, 'nach der ersten Absage wird für diese Adresse nichts mehr geschrieben');
  assert.equal((await pruefe(env, anfrage('203.0.113.8'), 1, TAG1)).erlaubt, true);
  assert.equal((await pruefe(env, anfrage('203.0.113.7'), 1, TAG2)).erlaubt, true, 'am nächsten Tag gilt die Merkliste nicht mehr');
});

test('Schlüssel ohne Freigabe teilen einen Deckel, freigegebene nicht; neue Schlüssel sind auch insgesamt begrenzt', async () => {
  const env = umgebung();
  const a = await (await api(seite('neu', '203.0.113.7'), env, TAG1)).json();
  const b = await (await api(seite('neu', '203.0.113.8'), env, TAG1)).json();
  const vorher = { ...GRENZEN };
  GRENZEN.gesamtSchluessel = 3; GRENZEN.neueSchluesselGesamt = 2;
  try {
    assert.equal((await pruefe(env, anfrage('198.51.100.1', a.key), 3, TAG1)).erlaubt, true);
    const p = await pruefe(env, anfrage('198.51.100.1', b.key), 1, TAG1);
    assert.deepEqual([p.erlaubt, p.grund], [false, 'gesamt']);
    assert.match(limitText(p), /ceiling for all personal accesses/);
    await admin.grant(env, b.kennung, 1000, 'Projekt');
    assert.equal((await pruefe(env, anfrage('198.51.100.1', b.key), 1, TAG1)).erlaubt, true, 'eine Freigabe von Hand liegt außerhalb des Deckels');
    const r = await api(seite('neu', '203.0.113.9'), env, TAG1);
    assert.deepEqual([r.status, (await r.json()).fehler], [429, 'zuviele-heute']);
  } finally { Object.assign(GRENZEN, vorher); }
});

/* ---------------- Stufe 2: the link to the fynn.land account ---------------- */

const SITZUNG_A = 'sitzung-konto-a-0123456789abcdef';
const SITZUNG_B = 'sitzung-konto-b-0123456789abcdef';
const CODE_OK = 'ABCDEFGHIJKLMNOPQRSTUV';
const VERIFIER_OK = 'v'.repeat(48);

/**
 * A stand-in for the account server's entrypoint Accounts with its real signatures
 * (op(game, op, body, meta), gameData(game, session, meta), saveGameData(game, session, data, meta)). Like the real one
 * it refuses another game or origin, and answers { ok: false, status, code } instead of throwing.
 */
function konten() {
  const sitzungen = new Map(); // session -> account id
  const daten = new Map();     // account id -> data of the game "fundus"
  const personen = new Map([['acc-1', { name: 'Kontoname', providerName: 'Anbietername', publicId: 'AAAAA-BBBBB' }]]);
  sitzungen.set(SITZUNG_A, 'acc-1');
  sitzungen.set(SITZUNG_B, 'acc-1'); // the same account on a second device
  const aufrufe = [];
  const prueft = (game, meta) => {
    if (game !== 'fundus') return { ok: false, status: 403, code: 'gameNotAllowed' };
    if (meta?.origin !== 'https://fundus.fynn.land') return { ok: false, status: 403, code: 'foreignOrigin' };
    if (!/^[0-9.]+$/.test(meta?.ip ?? '')) return { ok: false, status: 400, code: 'noClientIp' };
    return null;
  };
  const mitSitzung = (session) => (sitzungen.has(session) ? null : { ok: false, status: 401, code: 'accSessionExpired' });
  const konto = {
    aufrufe, sitzungen, daten, personen,
    ausfall: false,
    async op(game, op, body, meta) {
      aufrufe.push(op);
      if (konto.ausfall) throw new Error('Binding weg');
      const f = prueft(game, meta);
      if (f) return f;
      if (op === 'exchange') {
        if (body.code !== CODE_OK || !/^v+$/.test(body.verifier)) return { ok: false, status: 400, code: 'hubCodeInvalid' };
        sitzungen.set('sitzung-neu-0123456789abcdefgh', 'acc-1');
        return { ok: true, session: 'sitzung-neu-0123456789abcdefgh', account: personen.get('acc-1') };
      }
      if (op === 'me') return mitSitzung(body.session) ?? { ok: true, account: personen.get(sitzungen.get(body.session)) };
      if (op === 'logout') { sitzungen.delete(body.session); return { ok: true }; }
      return { ok: false, status: 404, code: 'unknownEndpoint' };
    },
    async gameData(game, session, meta) {
      aufrufe.push('gameData');
      if (konto.ausfall) throw new Error('Binding weg');
      return prueft(game, meta) ?? mitSitzung(session) ?? { ok: true, data: daten.get(sitzungen.get(session)) ?? null };
    },
    async saveGameData(game, session, data, meta) {
      aufrufe.push('saveGameData');
      const f = prueft(game, meta) ?? mitSitzung(session);
      if (f) return f;
      if (data === null) daten.delete(sitzungen.get(session)); else daten.set(sitzungen.get(session), data);
      return { ok: true };
    },
  };
  return konto;
}

const heuteIn = (ms) => new Date(ms).toISOString().slice(0, 10);
const tagBis = (ms) => heuteIn(ms + KONTO_TAGE * 864e5);
const kontoEnv = () => ({ ...umgebung(), KONTO: '1', ACCOUNTS: konten() });
const konto = (env, was, body, ip = '203.0.113.7', jetzt = TAG1) => api(seite(`konto/${was}`, ip, body), env, jetzt);
const zeilen = (env) => env.DB.roh.prepare('SELECT * FROM zugang').all();
const INFO = { anonym: 150, browser: 300, konto: 500 };

test('Konto: ausgeschaltet bleibt alles wie bisher, und die neue Spalte wird nicht einmal gelesen', async () => {
  const env = { ...umgebung(), ACCOUNTS: konten() }; // KONTO fehlt
  assert.equal(kontoAn(env), false);
  assert.equal((await konto(env, 'verbinden', { session: SITZUNG_A })).status, 404);
  assert.deepEqual(await (await api(new Request('https://fundus.fynn.land/api/zugang/info'), env)).json(), { an: true, konto: false, grenzen: INFO });
  assert.equal(env.ACCOUNTS.aufrufe.length, 0, 'kein Aufruf beim Kontoserver');
  // a database that does not have konto_bis yet (code deployed before the ALTER) still counts and limits
  env.DB.roh.exec('DROP TABLE zugang');
  env.DB.roh.exec("CREATE TABLE zugang (hash TEXT PRIMARY KEY, kennung TEXT NOT NULL, stufe TEXT NOT NULL DEFAULT 'browser', grenze INTEGER, gesperrt INTEGER NOT NULL DEFAULT 0, notiz TEXT, erzeugt TEXT NOT NULL, zuletzt TEXT) WITHOUT ROWID");
  const neu = await (await api(seite('neu', '203.0.113.7'), env, TAG1)).json();
  assert.equal(neu.stufe, 'browser');
  const p = await pruefe(env, anfrage('198.51.100.9', neu.key), 1, TAG1);
  assert.deepEqual([p.erlaubt, p.grenze, p.grund], [true, 300, null], 'ohne Spalte gilt die Grenze weiter, nichts läuft offen');
  assert.equal((await admin.list(env, TAG1)).ok, true);
  assert.ok((await aufraeumen(env, TAG1)).length >= 3, 'das Aufräumen bricht ohne Spalte nicht ab');
  // and the ALTER from worker/zugang-konto.sql brings an old database to the new shape
  const alt = new DatabaseSync(':memory:');
  alt.exec(SCHEMA[1].replace(', konto_bis TEXT', ''));
  for (const a of SCHEMA_KONTO) alt.exec(a);
  assert.ok(alt.prepare('PRAGMA table_info(zugang)').all().some((c) => c.name === 'konto_bis'));
  assert.match(readFileSync(new URL('../worker/zugang-konto.sql', import.meta.url), 'utf8'), /ALTER TABLE zugang ADD COLUMN konto_bis TEXT;/);
});

test('Konto: info nennt das Konto nur mit Schalter und Bindung, dazu die Adresse der Anmeldeseite', async () => {
  const lesen = async (env) => (await api(new Request('https://fundus.fynn.land/api/zugang/info'), env)).json();
  assert.deepEqual(await lesen({ ...kontoEnv(), ACCOUNTS: undefined }), { an: true, konto: false, grenzen: INFO });
  assert.deepEqual(await lesen(kontoEnv()), { an: true, konto: true, hub: 'https://fynn.land', kontoTage: 90, grenzen: INFO });
  assert.equal((await lesen({ ...kontoEnv(), FYNNLAND_HUB: 'http://localhost:8040' })).hub, 'http://localhost:8040');
  assert.equal((await lesen({ ...kontoEnv(), FYNNLAND_HUB: 'javascript:alert(1)' })).hub, 'https://fynn.land');
});

test('Konto: die Anmeldung abschließen tauscht den Code gegen eine Sitzung und nennt nur den Namen', async () => {
  const env = kontoEnv();
  const r = await konto(env, 'tausch', { code: CODE_OK, verifier: VERIFIER_OK });
  assert.deepEqual(await r.json(), { session: 'sitzung-neu-0123456789abcdefgh', name: 'Kontoname' });
  assert.equal((await (await konto(env, 'tausch', { code: CODE_OK, verifier: 'zu-kurz' })).json()).fehler, 'code');
  const falsch = await konto(env, 'tausch', { code: 'ZZZZZZZZZZZZZZZZZZZZZZ', verifier: VERIFIER_OK });
  assert.deepEqual([falsch.status, (await falsch.json()).fehler], [400, 'code']);
  // from another origin nothing is passed on
  const fremd = new Request('https://fundus.fynn.land/api/zugang/konto/tausch', { method: 'POST', headers: { Origin: 'https://boese.example' }, body: '{}' });
  assert.equal((await api(fremd, env, TAG1)).status, 403);
  // the provider's name is the fallback, and no name is no problem
  env.ACCOUNTS.personen.set('acc-1', { name: '', providerName: 'Anbieter', publicId: 'X' });
  assert.equal((await (await konto(env, 'tausch', { code: CODE_OK, verifier: VERIFIER_OK })).json()).name, 'Anbieter');
  env.ACCOUNTS.personen.set('acc-1', { name: null, providerName: null });
  assert.equal((await (await konto(env, 'tausch', { code: CODE_OK, verifier: VERIFIER_OK })).json()).name, null);
});

test('Konto ohne Datenstand: ein neuer Schlüssel entsteht, liegt im Konto und hat 500 Aufrufe', async () => {
  const env = kontoEnv();
  const r = await (await konto(env, 'verbinden', { session: SITZUNG_A })).json();
  assert.match(r.key, /^[A-Za-z0-9_-]{40}$/);
  assert.deepEqual([r.stufe, r.grenze, r.kontoBis, r.name, r.ersetzt], ['konto', 500, tagBis(TAG1), 'Kontoname', false]);
  assert.deepEqual(env.ACCOUNTS.daten.get('acc-1'), { key: r.key }, 'der Schlüssel liegt als Datenstand im Konto');
  assert.equal((await pruefe(env, anfrage('198.51.100.9', r.key), 1, TAG1)).grenze, 500);
  // the same account on a second device brings the same key back
  const zwei = await (await konto(env, 'verbinden', { session: SITZUNG_B }, '198.51.100.20')).json();
  assert.equal(zwei.key, r.key);
  assert.equal(zeilen(env).length, 1, 'kein zweiter Schlüssel');
});

test('Konto mit dem Schlüssel dieses Browsers: er zieht ins Konto um, ein unbekannter Schlüssel nicht', async () => {
  const env = kontoEnv();
  const browser = await (await api(seite('neu', '203.0.113.7'), env, TAG1)).json();
  assert.equal(browser.grenze, 300);
  const r = await (await konto(env, 'verbinden', { session: SITZUNG_A, key: browser.key })).json();
  assert.deepEqual([r.key, r.kennung, r.grenze, r.ersetzt], [browser.key, browser.kennung, 500, false]);
  assert.deepEqual(env.ACCOUNTS.daten.get('acc-1'), { key: browser.key });
  assert.equal(zeilen(env).length, 1);
  // a key nobody created is not taken over: a new one is made instead
  const env2 = kontoEnv();
  const r2 = await (await konto(env2, 'verbinden', { session: SITZUNG_A, key: 'x'.repeat(40) })).json();
  assert.notEqual(r2.key, 'x'.repeat(40));
  assert.equal(r2.ersetzt, true);
});

test('Konto mit Datenstand von einem anderen Gerät: der Schlüssel des Kontos gilt, nicht der im Browser', async () => {
  const env = kontoEnv();
  const daheim = await (await konto(env, 'verbinden', { session: SITZUNG_A })).json();
  const unterwegs = await (await api(seite('neu', '198.51.100.20'), env, TAG1)).json(); // a key this other browser made on its own
  const r = await (await konto(env, 'verbinden', { session: SITZUNG_B, key: unterwegs.key }, '198.51.100.20')).json();
  assert.deepEqual([r.key, r.ersetzt, r.grenze], [daheim.key, true, 500]);
  assert.equal((await pruefe(env, anfrage('198.51.100.9', unterwegs.key), 1, TAG1)).grenze, 300, 'der andere Schlüssel bleibt, wie er war: Browser-Stufe');
  assert.equal(zeilen(env).filter((z) => z.stufe === 'konto').length, 1, 'was der Browser schickt, hebt keinen zweiten Schlüssel an');
});

test('Konto: der Schlüssel im Konto hat keine Zeile mehr, dann kommt er unverändert zurück', async () => {
  const env = kontoEnv();
  const r = await (await konto(env, 'verbinden', { session: SITZUNG_A })).json();
  env.DB.roh.exec('DELETE FROM zugang');
  assert.equal((await pruefe(env, anfrage('198.51.100.9', r.key), 1, TAG1)).grund, 'unbekannt');
  const wieder = await (await konto(env, 'verbinden', { session: SITZUNG_A })).json();
  assert.deepEqual([wieder.key, wieder.grenze], [r.key, 500]);
  assert.equal(zeilen(env).length, 1);
  // a key in the account that is no key at all is ignored
  env.ACCOUNTS.daten.set('acc-1', { key: 'kein Schluessel' });
  const neu = await (await konto(env, 'verbinden', { session: SITZUNG_A })).json();
  assert.match(neu.key, /^[A-Za-z0-9_-]{40}$/);
  assert.equal(env.ACCOUNTS.daten.get('acc-1').key, neu.key);
});

test('Konto: ungültige Sitzung, Kontoserver nicht erreichbar, Spiel dort nicht eingetragen', async () => {
  const env = kontoEnv();
  const alt = await (await api(seite('neu', '203.0.113.7'), env, TAG1)).json();
  let r = await konto(env, 'verbinden', { session: 'abgelaufen-0123456789abcdefghij', key: alt.key });
  assert.deepEqual([r.status, (await r.json()).fehler], [401, 'sitzung']);
  r = await konto(env, 'verbinden', { key: alt.key });
  assert.equal(r.status, 401, 'ohne Sitzung gar kein Aufruf beim Konto');
  assert.equal(env.ACCOUNTS.aufrufe.length, 1, 'nur der Aufruf mit der abgelaufenen Sitzung ging hinaus');
  env.ACCOUNTS.ausfall = true;
  r = await konto(env, 'verbinden', { session: SITZUNG_A, key: alt.key });
  assert.deepEqual([r.status, (await r.json()).fehler], [502, 'konto']);
  env.ACCOUNTS.ausfall = false;
  assert.equal((await pruefe(env, anfrage('198.51.100.9', alt.key), 1, TAG1)).grenze, 300, 'der Zugang hat sich nicht verändert');
  assert.equal(env.ACCOUNTS.daten.size, 0);
  // the account server refuses the game (no entry in ACCOUNT_GAMES yet): 503 "nicht bereit", nothing changes
  env.ACCOUNTS.op = async () => ({ ok: false, status: 403, code: 'gameNotAllowed' });
  env.ACCOUNTS.gameData = async () => ({ ok: false, status: 403, code: 'gameNotAllowed' });
  r = await konto(env, 'verbinden', { session: SITZUNG_A });
  assert.deepEqual([r.status, (await r.json()).fehler], [503, 'nicht-bereit']);
  r = await konto(env, 'tausch', { code: CODE_OK, verifier: VERIFIER_OK });
  assert.deepEqual([r.status, (await r.json()).fehler], [503, 'nicht-bereit']);
});

test('Konto: neue Schlüssel über das Konto zählen gegen dieselben Grenzen wie die Seite', async () => {
  const env = kontoEnv();
  const vorher = GRENZEN.neueSchluessel;
  GRENZEN.neueSchluessel = 1;
  try {
    assert.equal((await konto(env, 'verbinden', { session: SITZUNG_A })).status, 200);
    env.ACCOUNTS.daten.delete('acc-1');
    const r = await konto(env, 'verbinden', { session: SITZUNG_A });
    assert.deepEqual([r.status, (await r.json()).fehler], [429, 'zuviele']);
    assert.equal(env.ACCOUNTS.daten.size, 0, 'abgewiesen heißt: nichts ins Konto geschrieben');
  } finally { GRENZEN.neueSchluessel = vorher; }
});

test(`Konto: nach ${KONTO_TAGE} Tagen ohne Besuch fällt der Zugang auf 300 zurück, ein Besuch verlängert`, async () => {
  const env = kontoEnv();
  const r = await (await konto(env, 'verbinden', { session: SITZUNG_A })).json();
  const tage = (n) => TAG1 + n * 864e5;
  assert.equal((await pruefe(env, anfrage('198.51.100.9', r.key), 1, tage(KONTO_TAGE))).grenze, 500, 'am letzten Tag gilt es noch');
  const abgelaufen = await pruefe(env, anfrage('198.51.100.9', r.key), 1, tage(KONTO_TAGE + 1));
  assert.deepEqual([abgelaufen.erlaubt, abgelaufen.grenze, abgelaufen.stufe], [true, 300, 'browser']);
  const stand = await (await api(seite('stand', '203.0.113.7', { key: r.key }), env, tage(KONTO_TAGE + 1))).json();
  assert.deepEqual([stand.grenze, stand.stufe, 'kontoBis' in stand], [300, 'browser', false], 'der Ring zeigt, was gilt');
  const liste = await admin.list(env, tage(KONTO_TAGE + 1));
  assert.deepEqual([liste.zugaenge[0].grenze, liste.zugaenge[0].stufe, 'konto_bis' in liste.zugaenge[0]], [300, 'browser', false], 'das Dashboard auch');
  assert.equal(wirkStufe(env, { stufe: 'konto', konto_bis: null }, '2026-12-01'), 'browser');
  // the page opened with a valid session in time renews it
  const spaeter = await (await konto(env, 'verbinden', { session: SITZUNG_A }, '203.0.113.7', tage(60))).json();
  assert.equal(spaeter.kontoBis, tagBis(tage(60)));
  assert.equal((await pruefe(env, anfrage('198.51.100.9', r.key), 1, tage(KONTO_TAGE + 1))).grenze, 500);
  // and after the date the clean-up sets the row back; nothing is lost beyond that
  await aufraeumen(env, tage(60 + KONTO_TAGE + 1));
  assert.deepEqual(zeilen(env).map((z) => [z.stufe, z.konto_bis]), [['browser', null]]);
  // a grant by hand stays what it is, linked or not
  await admin.grant(env, r.kennung, 5000, 'Projekt');
  assert.equal((await pruefe(env, anfrage('198.51.100.9', r.key), 1, tage(61))).grenze, 5000);
});

test('Konto lösen: der Zugang fällt auf die Browser-Stufe, der Schlüssel verlässt das Konto, die Sitzung endet', async () => {
  const env = kontoEnv();
  const r = await (await konto(env, 'verbinden', { session: SITZUNG_A })).json();
  const weg = await (await konto(env, 'loesen', { session: SITZUNG_A, key: r.key })).json();
  assert.deepEqual(weg, { ok: true, imKonto: true });
  assert.equal(env.ACCOUNTS.daten.size, 0);
  assert.equal(env.ACCOUNTS.sitzungen.has(SITZUNG_A), false);
  assert.deepEqual(zeilen(env).map((z) => [z.stufe, z.konto_bis]), [['browser', null]]);
  assert.equal((await pruefe(env, anfrage('198.51.100.9', r.key), 1, TAG1)).grenze, 300);
  // with a session that has ended the tier still falls back; only the account's own copy stays until the next sign-in
  const r2 = await (await konto(env, 'verbinden', { session: SITZUNG_B })).json();
  const spaet = await (await konto(env, 'loesen', { session: 'abgelaufen-0123456789abcdefghij', key: r2.key })).json();
  assert.deepEqual(spaet, { ok: true, imKonto: false });
  assert.equal(zeilen(env).find((z) => z.kennung === r2.kennung).stufe, 'browser');
});

test('Zugang löschen mit Sitzung nimmt den Schlüssel auch aus dem Konto, sonst käme er von dort zurück', async () => {
  const env = kontoEnv();
  const r = await (await konto(env, 'verbinden', { session: SITZUNG_A })).json();
  await api(seite('loeschen', '203.0.113.7', { key: r.key, session: SITZUNG_A }), env, TAG1);
  assert.equal(zeilen(env).length, 0);
  assert.equal(env.ACCOUNTS.daten.size, 0);
  assert.equal(env.ACCOUNTS.sitzungen.has(SITZUNG_A), false);
});

test('Konto: Fundus speichert weder Kennung noch Namen noch Sitzung, und das Dashboard sieht nichts davon', async () => {
  const env = kontoEnv();
  const r = await (await konto(env, 'verbinden', { session: SITZUNG_A })).json();
  await pruefe(env, anfrage('198.51.100.9', r.key), 1, TAG1);
  const alles = JSON.stringify([zeilen(env), env.DB.roh.prepare('SELECT * FROM zaehler').all(), await admin.list(env, TAG1), await admin.counts(env, TAG1)]);
  for (const geheim of ['acc-1', 'Kontoname', 'Anbietername', 'AAAAA-BBBBB', SITZUNG_A, SITZUNG_B, 'sitzung-neu', r.key]) assert.ok(!alles.includes(geheim), `${geheim} liegt nicht in der Datenbank oder im Dashboard`);
  assert.ok(!JSON.stringify(r).includes('AAAAA-BBBBB') && !JSON.stringify(r).includes('acc-1'), 'auch die Antwort an die Seite nennt keine Kennung');
  assert.ok(env.ACCOUNTS.aufrufe.length > 0);
});
