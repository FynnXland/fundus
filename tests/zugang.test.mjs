// Daily allowances, access keys and grants (worker/zugang.mjs), against a real SQLite in memory behind the
// handful of D1 methods the code uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/index.mjs';
import { beforeEach } from 'node:test';
import { SCHEMA, GRENZEN, pruefe, api, admin, aufraeumen, netz, limitText, werkzeugAufrufe, schluesselVon, sha256, kennungVon, vergiss } from '../worker/zugang.mjs';
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
  assert.deepEqual(await (await api(new Request('https://fundus.fynn.land/api/zugang/info'), env)).json(), { an: false, grenzen: null });
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
