// Ratings, popularity, the recommended order and the new index fields (rating/popularity schema, adapters,
// rang, bew/pop in the rows, sorting in the browser). Values in the fixtures are real answers of 23.11.2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { bewertung, beliebtheit, sterne5, rangwerte, pruefeBewertung, BAYES_GEWICHT } from '../crawler/lib/bewertung.mjs';
import { validateItem } from '../crawler/lib/schema.mjs';
import { makeItem } from '../crawler/lib/item.mjs';
import { baueAusgabe, empfohlen } from '../crawler/lib/ausgabe.mjs';
import { FELDER, zeile, suchfelder, startauswahl } from '../crawler/publish.mjs';
import { parseItem as parseIa, searchUrl, bewertungVon } from '../crawler/sources/internetarchive.mjs';
import { parseAsset as parsePolyHaven } from '../crawler/sources/polyhaven.mjs';
import { parseAsset as parseAmbient } from '../crawler/sources/ambientcg.mjs';
import { parseModel as parseFuel } from '../crawler/sources/fuel.mjs';
import { parseRepo, skillItem } from '../crawler/sources/github.mjs';
import { ladeKatalog, hole, filtern, bedarf, SORTIERUNGEN, STANDARD_SORT } from '../src/katalog.js';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const IA = fx('internetarchive').metadata;
const quelle = { name: 'Internet Archive', url: 'https://archive.org/details/EAR020#reviews' };

/* ---------------- Schema ---------------- */

test('Sterne: 5 * Wert / Maximum, zwei Stellen, nichts bei 0 Stimmen oder außerhalb der Skala', () => {
  assert.equal(sterne5({ value: 4.33, min: 1, max: 5, count: 3 }), 4.33);
  assert.equal(sterne5({ value: 8.7, min: 0, max: 10, count: 12 }), 4.35);
  assert.equal(sterne5({ value: 3, min: 0, max: 5, count: 1 }), 3);
  assert.equal(sterne5({ value: 2 / 3, min: 0, max: 1, count: 9 }), 3.33);
  assert.equal(sterne5({ value: 4, min: 1, max: 5, count: 0 }), null);
  assert.equal(sterne5({ value: 6, min: 1, max: 5, count: 4 }), null);
  assert.equal(sterne5(undefined), null);
});

test('bewertung() und beliebtheit(): ungültige Werte ergeben nichts statt eines falschen Eintrags', () => {
  assert.equal(bewertung({ value: 4, max: 5, count: 0, name: 'x', url: 'https://x.org' }), undefined);
  assert.equal(bewertung({ value: undefined, max: 5, count: 3, name: 'x', url: 'https://x.org' }), undefined);
  assert.equal(beliebtheit({ value: 0, label: 'Downloads', name: 'x', url: 'https://x.org' }), undefined);
  assert.equal(beliebtheit({ value: 12, label: 'Gefällt mir', name: 'x', url: 'https://x.org' }), undefined, 'Label nur aus der Liste');
  assert.deepEqual(beliebtheit({ value: 12.9, label: 'Likes', name: 'x', url: 'https://x.org' }), { value: 12, label: 'Likes', source: { name: 'x', url: 'https://x.org' } });
});

test('validateItem: prüft rating und popularity nur, wenn sie da sind', () => {
  const ia = parseIa(IA, { stats: fx('internetarchive-bewertung').treffer[0] });
  assert.deepEqual(validateItem(ia), []);
  assert.deepEqual(validateItem({ ...ia, rating: undefined, popularity: undefined }), []);
  assert.ok(pruefeBewertung({ ...ia, rating: { ...ia.rating, count: 0 } }).length);
  assert.ok(pruefeBewertung({ ...ia, rating: { ...ia.rating, value: 5.5 } }).length);
  assert.ok(pruefeBewertung({ ...ia, rating: { ...ia.rating, source: { name: 'x', url: 'kaputt' } } }).length);
  assert.ok(pruefeBewertung({ ...ia, popularity: { ...ia.popularity, label: 'Gefällt mir' } }).length);
  assert.ok(validateItem({ ...ia, popularity: { value: -1, label: 'Downloads', source: ia.popularity.source } }).length);
});

test('makeItem reicht rating und popularity durch und lässt fehlende Felder weg', () => {
  const ohne = parseIa(IA);
  assert.ok(!('rating' in ohne) && !('popularity' in ohne));
});

/* ---------------- Adapter ---------------- */

test('Internet Archive: Bewertung und Downloads kommen aus dem Suchtreffer, ohne weitere Anfrage', () => {
  const [mit, einmal] = fx('internetarchive-bewertung').treffer;
  const it = parseIa(IA, { stats: mit });
  assert.deepEqual(it.rating, { value: 4.33, min: 1, max: 5, count: 3, source: { name: 'Internet Archive', url: 'https://archive.org/details/Unounoou#reviews' } });
  assert.equal(sterne5(it.rating), 4.33);
  assert.deepEqual(it.popularity, { value: 7527, label: 'Downloads', source: { name: 'Internet Archive', url: 'https://archive.org/details/Unounoou' } });
  assert.equal(sterne5(parseIa(IA, { stats: einmal }).rating), 3);
  // an item nobody reviewed has neither avg_rating nor num_reviews in the hit
  const ohne = parseIa(IA, { stats: { identifier: 'Unounoou', downloads: 62217 } });
  assert.equal(ohne.rating, undefined);
  assert.equal(ohne.popularity.value, 62217);
  assert.deepEqual(bewertungVon('x', undefined), {});
  const fl = new URL(searchUrl('netlabels', 100, 1)).searchParams.getAll('fl[]');
  assert.deepEqual(fl, ['identifier', 'addeddate', 'avg_rating', 'num_reviews', 'downloads']);
});

test('Poly Haven, ambientCG, Fuel: Downloads aus der Listen-Antwort', () => {
  const { info, files } = fx('polyhaven-model');
  const ph = parsePolyHaven('ArmChair_01', info, files);
  assert.deepEqual(ph.popularity, { value: 33171, label: 'Downloads', source: { name: 'Poly Haven', url: 'https://polyhaven.com/a/ArmChair_01' } });
  assert.equal(ph.rating, undefined);
  const acg = parseAmbient(fx('ambientcg-asset'));
  assert.equal(acg.popularity.value, 1080);
  assert.equal(acg.popularity.label, 'Downloads');
  assert.equal(parseAmbient({ ...fx('ambientcg-asset'), downloadCount: undefined }).popularity, undefined);
  const row = fx('fuel-models').find((r) => r.owner === 'yoz' && r.name === 'Ambulance');
  const fuel = parseFuel(row);
  assert.deepEqual(fuel.popularity, { value: 326, label: 'Downloads', source: { name: 'Gazebo Fuel', url: 'https://app.gazebosim.org/yoz/fuel/models/Ambulance' } });
  assert.equal(parseFuel({ ...row, downloads: 0 }).popularity, undefined, 'null Downloads sind keine Beliebtheit');
});

test('GitHub: Sterne des Repos für Projekte und für die Skills der Sammlung', () => {
  const repo = fx('github-repo');
  const p = parseRepo(repo, 'projekt');
  assert.deepEqual(p.popularity, { value: repo.stargazers_count, label: 'GitHub-Sterne', source: { name: 'GitHub', url: repo.html_url } });
  assert.equal(p.rating, undefined, 'GitHub hat keine Bewertungen, nur Sterne');
  const s = skillItem({ repo, dir: 'skills/x', front: { name: 'x', description: 'd' }, license: p.license, files: [{ path: 'skills/x/SKILL.md', size: 10 }], md: '# x' });
  assert.equal(s.popularity.value, repo.stargazers_count);
  assert.equal(s.popularity.source.url, repo.html_url);
});

/* ---------------- Rangformel ---------------- */

const item = (id, source, kind, extra = {}) => ({ id, kind, source: { id: source, name: source }, sig: `X·${id}`, ...extra });
const rated = (stars, count) => ({ value: stars, min: 1, max: 5, count, source: quelle });
const pop = (n) => ({ value: n, label: 'Downloads', source: quelle });

test('Rang: eine Stimme mit 5,0 steht nicht vor 4,8 bei 1.000 Stimmen', () => {
  const liste = rangwerte([
    item('eine', 'ia', 'musik', { rating: rated(5, 1) }),
    item('viele', 'ia', 'musik', { rating: rated(4.8, 1000) }),
    item('mittel', 'ia', 'musik', { rating: rated(4.7, 12) }),
    ...Array.from({ length: 30 }, (_, i) => item(`f${i}`, 'ia', 'musik', { rating: rated(4 + (i % 5) / 4, 2 + i) })),
  ]);
  const r = Object.fromEntries(liste.map((x) => [x.id, x.rang]));
  assert.ok(r.viele > r.eine, `${r.viele} > ${r.eine}`);
  assert.ok(r.viele > r.mittel);
  assert.ok(r.mittel > r.eine, '4,7 bei 12 Stimmen vor 5,0 bei einer Stimme');
  assert.ok(BAYES_GEWICHT >= 3);
});

test('Rang: Bewertung vor Beliebtheit vor nichts; Beliebtheit je Quelle und Art normalisiert', () => {
  const liste = rangwerte([
    item('b', 'ia', 'musik', { rating: rated(3, 2), popularity: pop(5) }),
    item('p-hoch', 'gh', 'skill', { popularity: pop(200000) }),
    item('p-niedrig', 'gh', 'skill', { popularity: pop(40) }),
    item('ph-hoch', 'ph', '3d', { popularity: pop(30000) }),
    item('nichts', 'wm', 'bild'),
    ...Array.from({ length: 100 }, (_, i) => item(`g${i}`, 'gh', 'skill', { popularity: pop(10 + i * 100) })),
    ...Array.from({ length: 100 }, (_, i) => item(`h${i}`, 'ph', '3d', { popularity: pop(10 + i * 10) })),
  ]);
  const r = Object.fromEntries(liste.map((x) => [x.id, x.rang]));
  assert.ok(r.b > r['p-hoch'], 'eine echte Bewertung schlägt jede Beliebtheit');
  assert.ok(r['p-hoch'] > r['p-niedrig']);
  assert.ok(r['p-niedrig'] > r.nichts);
  assert.equal(r.nichts, 0);
  // the most popular of each source and kind reaches the top of the popularity band, whatever the absolute count
  assert.equal(r['p-hoch'], r['ph-hoch'], 'GitHub-Sterne schlagen Downloads nicht, jede Quelle hat ihre eigene Skala');
  assert.ok(r['p-hoch'] < 20000 && r['p-niedrig'] >= 10000);
});

test('Rang: ein Ausreißer drückt den Rest nicht auf null', () => {
  const liste = rangwerte([item('riese', 'ia', 'musik', { popularity: pop(11000000) }), ...Array.from({ length: 200 }, (_, i) => item(`k${i}`, 'ia', 'musik', { popularity: pop(1 + i * 50) }))]);
  const mitte = liste.find((x) => x.id === 'k100').rang;
  assert.ok(mitte > 10000 + 2000, `mittlerer Eintrag liegt bei ${mitte}`);
});

/* ---------------- Index ---------------- */

const hex = (i) => createHash('sha1').update(String(i)).digest('hex');
function eintrag(i, kind, extra = {}) {
  return {
    id: `${kind}:${i}`, sig: hex(`${kind}${i}`).slice(0, 8).toUpperCase(), kind, unter: ['Holz', 'Stein'][i % 2],
    title: `Eintrag ${i}`, tags: ['natur'], creator: { name: 'x' }, source: { id: 'q', name: 'Quelle' },
    license: { name: 'CC0 1.0', attribution: false }, downloads: [{ format: 'mp3' }], preview: { type: 'text', text: 't' },
    firstSeen: '2026-01-02T00:00:00Z', ...extra,
  };
}
const ITEMS = Array.from({ length: 700 }, (_, i) => {
  const extra = {};
  if (i % 10 === 0) extra.rating = rated(1 + (i % 40) / 10, 1 + (i % 17));
  else if (i % 3 === 0) extra.popularity = pop(i * 7);
  return eintrag(i, 'musik', extra);
});
rangwerte(ITEMS);
ITEMS.sort((a, b) => (a.sig.slice(-5) < b.sig.slice(-5) ? -1 : 1));

test('Zeile: bew, pop und rang stehen am Ende von FELDER und in der Zeile', () => {
  assert.deepEqual(FELDER.slice(-3), ['bew', 'pop', 'rang']);
  const r = ITEMS.find((it) => it.rating);
  const z = zeile(r);
  assert.equal(z.length, FELDER.length);
  assert.deepEqual(z[FELDER.indexOf('bew')], [sterne5(r.rating), r.rating.count, 'Internet Archive']);
  assert.equal(z[FELDER.indexOf('pop')], null);
  assert.equal(z[FELDER.indexOf('rang')], r.rang);
  const p = ITEMS.find((it) => it.popularity);
  assert.deepEqual(zeile(p)[FELDER.indexOf('pop')], [p.popularity.value, 'Downloads']);
  const leer = zeile(eintrag(1, 'musik'));
  assert.equal(leer[FELDER.indexOf('bew')], null);
  assert.equal(leer[FELDER.indexOf('rang')], 0);
});

test('Kopf: die 240 besten Zeilen, nicht die ersten der gemischten Reihenfolge', () => {
  const aus = baueAusgabe(ITEMS, { arten: ['musik'], felder: FELDER, zeile: (it) => zeile(it), suchfelder, lizenzgruppe: () => 'frei' });
  const kopf = aus.dateien.get('index/musik/kopf.json').zeilen;
  assert.equal(kopf.length, 240);
  const iRang = FELDER.indexOf('rang');
  const raenge = kopf.map((z) => z[iRang]);
  assert.deepEqual(raenge, [...raenge].sort((a, b) => b - a), 'nach Rang absteigend');
  const alle = ITEMS.map((it) => it.rang).sort((a, b) => b - a);
  assert.equal(raenge[239], alle[239], 'der Kopf enthält wirklich die obersten 240');
  assert.ok(raenge[0] >= 20000, 'bewertete Einträge zuerst');
  // parts keep their order by subfolder
  assert.equal(aus.index.arten[0].teile.length, 2);
  assert.ok(ITEMS.slice().sort(empfohlen)[0].rang === raenge[0]);
});

test('Startauswahl: von zwei gleichwertigen Einträgen kommt der besser bewertete zuerst', () => {
  const a = eintrag(1, 'musik', { rang: 0 });
  const b = eintrag(2, 'musik', { rang: 21000 });
  assert.equal(startauswahl([a, b], 1)[0].id, b.id);
});

/* ---------------- Browser ---------------- */

const aus = baueAusgabe(ITEMS, { arten: ['musik'], felder: FELDER, zeile: (it) => zeile(it), suchfelder, lizenzgruppe: () => 'frei' });
const DATEIEN = new Map(aus.dateien);
DATEIEN.set('stand.json', { total: ITEMS.length, perKind: { musik: ITEMS.length }, sources: [{ id: 'q', name: 'Quelle' }], index: aus.index });
DATEIEN.set('start.json', { felder: ['art', ...FELDER], zeilen: startauswahl(ITEMS, 20).map((it) => [it.kind, ...zeile(it)]) });
globalThis.fetch = async (url) => {
  const inhalt = DATEIEN.get(url.replace(/^\/data\//, ''));
  return inhalt === undefined ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => structuredClone(inhalt) };
};

test('katalog.js: bewertung und beliebtheit als Objekte, rang als Zahl, die Rohfelder fallen weg', async () => {
  const k = await ladeKatalog();
  await hole(k, 'musik!');
  const { liste } = filtern(k, { art: 'musik' });
  const r = ITEMS.find((it) => it.rating);
  const o = liste.find((x) => x.id === r.id);
  assert.deepEqual(o.bewertung, { sterne: sterne5(r.rating), anzahl: r.rating.count, quelle: 'Internet Archive' });
  assert.equal(o.beliebtheit, undefined);
  assert.ok(!('bew' in o) && !('pop' in o));
  const p = liste.find((x) => x.id === ITEMS.find((it) => it.popularity).id);
  assert.deepEqual(p.beliebtheit, { wert: p.beliebtheit.wert, label: 'Downloads' });
  assert.equal(p.bewertung, undefined);
  const leer = liste.find((x) => !x.bewertung && !x.beliebtheit);
  assert.equal(leer.rang, 0);
});

test('Sortierungen: empfohlen ist der Standard und braucht nur den Kopf, bewertung und gemischt brauchen alles', async () => {
  assert.equal(STANDARD_SORT, 'empfohlen');
  assert.deepEqual(Object.keys(SORTIERUNGEN).slice(0, 3), ['empfohlen', 'bewertung', 'gemischt']);
  assert.equal(SORTIERUNGEN.bewertung, 'Beste Bewertung');
  assert.equal(bedarf({ art: 'musik' }), 'musik');
  assert.equal(bedarf({ art: 'musik', sort: 'empfohlen' }), 'musik');
  assert.equal(bedarf({ art: 'musik', sort: 'bewertung' }), 'musik!');
  assert.equal(bedarf({ art: 'musik', sort: 'gemischt' }), 'musik!');
  const k = await ladeKatalog();
  await hole(k, 'musik!');
  const emp = filtern(k, { art: 'musik', sort: 'empfohlen' }).liste;
  assert.deepEqual(emp.map((o) => o.rang), emp.map((o) => o.rang).sort((a, b) => b - a));
  const bew = filtern(k, { art: 'musik', sort: 'bewertung' }).liste;
  const nBewertet = ITEMS.filter((it) => it.rating).length;
  assert.ok(bew.slice(0, nBewertet).every((o) => o.bewertung), 'erst alle mit Bewertung');
  assert.ok(bew.slice(nBewertet).every((o) => !o.bewertung));
  assert.deepEqual(bew.slice(0, nBewertet).map((o) => o.rang), bew.slice(0, nBewertet).map((o) => o.rang).sort((a, b) => b - a));
  const mix = filtern(k, { art: 'musik', sort: 'gemischt' }).liste.map((o) => o.m);
  assert.deepEqual(mix, [...mix].sort());
});

/* ---------------- Nachträge: kleine Gruppen, Mischung der Arten, Blender, GitHub-Auswahl ---------------- */

test('Rang: eine kleine Gruppe bekommt nicht allein die volle Punktzahl, sondern die Skala ihrer Quelle', () => {
  const liste = rangwerte([
    ...Array.from({ length: 60 }, (_, i) => item(`a${i}`, 'gh', 'projekt', { popularity: pop(100 + i * 1000) })),
    item('klein', 'gh', 'sound', { popularity: pop(45) }),
    item('klein2', 'gh', 'sound', { popularity: pop(30) }),
  ]);
  const r = Object.fromEntries(liste.map((x) => [x.id, x.rang]));
  assert.ok(r.klein < 10000 + 5000, `ein Sound-Repo mit 45 Sternen liegt bei ${r.klein}, nicht oben`);
  assert.ok(r.klein > r.klein2);
  assert.ok(r.a59 > r.klein);
});

test('Alle Objekte: die Arten werden nach Platz gemischt, Bilder ohne Rang stehen nicht hinter allem anderen', async () => {
  const bild = Array.from({ length: 40 }, (_, i) => eintrag(i, 'bild'));
  const musik = Array.from({ length: 40 }, (_, i) => eintrag(i, 'musik', { rang: 25000 - i }));
  const alle = [...bild, ...musik];
  const a2 = baueAusgabe(alle, { arten: ['bild', 'musik'], felder: FELDER, zeile: (it) => zeile(it), suchfelder, lizenzgruppe: () => 'frei' });
  const d = new Map(a2.dateien);
  d.set('stand.json', { total: 80, perKind: { bild: 40, musik: 40 }, sources: [{ id: 'q', name: 'Quelle' }], index: a2.index });
  d.set('start.json', { felder: ['art', ...FELDER], zeilen: [] });
  const echt = globalThis.fetch;
  globalThis.fetch = async (url) => { const x = d.get(url.replace(/^\/data\//, '')); return x === undefined ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => structuredClone(x) }; };
  try {
    const k = await ladeKatalog();
    await hole(k, 'alle!');
    const liste = filtern(k, {}, true).liste.slice(0, 20);
    assert.equal(liste.filter((o) => o.art === 'bild').length, 10, 'jede zweite Zeile ist ein Bild');
    assert.deepEqual(liste.filter((o) => o.art === 'musik').map((o) => o.rang), liste.filter((o) => o.art === 'musik').map((o) => o.rang).sort((x, y) => y - x), 'Musik nach Rang');
  } finally {
    globalThis.fetch = echt;
  }
});

test('Ordner mit Rückruf und Rang: der Kopf bleibt nach dem Nachladen ganz oben', async () => {
  const { beimNachladen } = await import('../src/katalog.js');
  const echt = globalThis.fetch;
  globalThis.fetch = async (url) => { if (/index\/\w+\/\d+\.json$/.test(url)) await new Promise((ok) => setTimeout(ok, 5)); return echt(url); }; // parts are slower than heads
  const k = await ladeKatalog();
  let fertig;
  const warten = new Promise((ok) => { fertig = ok; });
  beimNachladen(k, () => fertig());
  await hole(k, 'musik');
  const kopf = filtern(k, { art: 'musik' }).liste.map((o) => o.id);
  assert.equal(kopf.length, 240);
  await warten;
  const voll = filtern(k, { art: 'musik' }).liste;
  assert.equal(voll.length, 700);
  assert.deepEqual(voll.slice(0, 240).map((o) => o.id), kopf, 'der Kopf sind die obersten 240 der vollständigen Liste');
  k.nachladen = null;
  globalThis.fetch = echt;
});

test('Blender: Karten der Listenseite ergeben Sterne, Stimmen und Downloads', async () => {
  const { parseCards, mitKarten } = await import('../crawler/sources/blender.mjs');
  const cards = parseCards(readFileSync(new URL('./fixtures/blender-liste.html', import.meta.url), 'utf8'));
  assert.deepEqual(cards.get('simple-deform-helper'), { stars: 5, votes: 176, downloads: 114000 });
  assert.deepEqual(cards.get('ontwos-retimer'), { stars: null, votes: 0, downloads: 333 }, 'ohne Stimmen keine Sterne');
  const basis = { id: 'blender:x', source: { id: 'blender', url: 'https://extensions.blender.org/add-ons/simple-deform-helper/' } };
  const [mit, ohne, fremd] = mitKarten([basis, { id: 'blender:y', source: { id: 'blender', url: 'https://extensions.blender.org/add-ons/ontwos-retimer/' } }, { id: 'blender:z', source: { id: 'blender', url: 'https://extensions.blender.org/add-ons/unbekannt/' } }], cards);
  assert.deepEqual(mit.rating, { value: 5, min: 0, max: 5, count: 176, source: { name: 'Blender Extensions', url: 'https://extensions.blender.org/add-ons/simple-deform-helper/reviews/' } });
  assert.equal(mit.popularity.value, 114000);
  assert.equal(ohne.rating, undefined);
  assert.equal(ohne.popularity.value, 333);
  assert.equal(fremd.rating, undefined);
});

test('GitHub: bei zu vielen Treffern gewinnen die Repos mit den meisten Sternen, genannte Sammlungen stehen immer drin', async () => {
  const { waehleSkillRepos } = await import('../crawler/sources/github.mjs');
  const r = (n, s) => ({ full_name: n, stargazers_count: s });
  const repos = [r('a/erste-suche', 50), r('b/anthropic', 200000), r('c/viel', 90000), r('d/mittel', 4000), r('e/mehr', 120000)];
  assert.deepEqual(waehleSkillRepos(repos, { skillRepos: ['A/Erste-Suche'], skillReposMax: 2 }).map((x) => x.full_name), ['a/erste-suche', 'b/anthropic', 'e/mehr']);
  assert.deepEqual(waehleSkillRepos(repos, { skillReposMax: 1 }).map((x) => x.full_name), ['b/anthropic']);
  assert.deepEqual(waehleSkillRepos(repos, { skillReposMax: 1, skillAusschliessen: ['B/Anthropic'] }).map((x) => x.full_name), ['e/mehr'], 'ausgeschlossene Repos kommen nicht aus der Suche');
});

test('Nachtragen: Internet-Archive-Treffer und Fuel-Abrufe landen im vorhandenen Eintrag, alte Werte werden ersetzt', async () => {
  const { anwenden, fuelAnwenden, nachIds } = await import('../crawler/bewertungen-nachtragen.mjs');
  const alt = [
    { id: 'internetarchive:EAR020', source: { id: 'internetarchive', url: 'https://archive.org/details/EAR020' }, rating: rated(1, 1) },
    { id: 'internetarchive:copo01', source: { id: 'internetarchive', url: 'https://archive.org/details/copo01' } },
    { id: 'internetarchive:weg', source: { id: 'internetarchive', url: 'https://archive.org/details/weg' } },
  ];
  const r = anwenden(alt, fx('internetarchive-bewertung').treffer);
  assert.equal(r.items[0].rating.value, 4.33, 'frische Antwort ersetzt den alten Wert');
  assert.equal(r.items[1].rating.count, 1);
  assert.equal(r.items[2].rating, undefined, 'nicht gefunden: bleibt, wie er war');
  assert.deepEqual([r.bewertet, r.beliebt], [2, 2]);
  assert.equal(new URL(nachIds(['a', 'b'])).searchParams.get('q'), 'identifier:("a" OR "b")');
  const f = fuelAnwenden([{ id: 'fuel:a/b', source: { url: 'https://app.gazebosim.org/a/fuel/models/b' }, meta: { abrufe: '326' } }, { id: 'fuel:c/d', source: { url: 'https://x.org/' } }]);
  assert.equal(f.items[0].popularity.value, 326);
  assert.equal(f.items[1].popularity, undefined);
});
