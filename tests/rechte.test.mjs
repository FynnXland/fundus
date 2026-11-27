// Rights check for music (no network): title normalising, protection term, verdict thresholds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titelNormal, geschuetzt, einstufen, urteil } from '../crawler/lib/rechte.mjs';
import { publishable } from '../crawler/publish.mjs';

const werk = (titel, aufnahmen, autoren) => ({ id: titel, titel, aufnahmen, iswc: true, autoren });
const JBR = { gleichnamig: 3, werke: [werk('Jingle Bell Rock', 324, [{ name: 'Joe Beal', tod: 1967, geboren: 1900 }, { name: 'Jim Boothe', tod: 1976 }])] };
const JB = { gleichnamig: 95, werke: [werk('Jingle Bells', 1293, [{ name: 'James Lord Pierpont', tod: 1893 }])] };
const lied = (title, creator = 'MonacoLorenzo', extra = {}) => ({ id: `openverse:${title}`, kind: 'musik', title, creator: { name: creator }, ...extra });

test('Rechte: Titel ohne Tracknummer, Dateiendung und Versionshinweis', () => {
  assert.equal(titelNormal('03 - Jingle Bell Rock (Live).mp3'), 'jingle bell rock');
  assert.equal(titelNormal('Lullaby ( Hip Hop Mix )'), 'lullaby');
  assert.equal(titelNormal('The Show - Electronic Mix'), 'the show');
  assert.equal(titelNormal('Song feat. Someone'), 'song');
});

test('Rechte: Schutzfrist 70 Jahre nach dem Tod', () => {
  assert.equal(geschuetzt({ tod: 1967 }, 2026), true);
  assert.equal(geschuetzt({ tod: 1955 }, 2026), false);
  assert.equal(geschuetzt({ tod: 1956 }, 2026), true);
  assert.equal(geschuetzt({ geboren: 1963 }, 2026), true);
  assert.equal(geschuetzt({}, 2026), null);
});

test('Rechte: Jingle Bell Rock fällt raus, Jingle Bells (gemeinfrei) bleibt', () => {
  assert.equal(urteil(lied('Jingle bell rock'), JBR, { jahr: 2026 }).stufe, 'fremd');
  assert.equal(urteil(lied('Jingle Bells'), JB, { jahr: 2026 }).stufe, 'ok');
});

test('Rechte: allgemeine Titel werden nicht beurteilt, Welthits auch mit Namensvettern', () => {
  assert.equal(einstufen(102, 22), null); // Meditation
  assert.equal(einstufen(461, 6), 'fremd'); // Bohemian Rhapsody
  assert.equal(einstufen(29, 6), null); // Oasis
  assert.equal(einstufen(5, 2), 'verdacht');
});

test('Rechte: der Hochlader als Urheber, Cover-Hinweis, noch nicht geprüft', () => {
  assert.equal(urteil(lied('Jingle Bell Rock', 'Joe Beal'), JBR, { jahr: 2026 }).stufe, 'ok');
  assert.equal(urteil(lied('Surf City (Battletoads Cover)'), null).stufe, 'verdacht');
  assert.equal(urteil(lied('Chocolate covered cherries'), null).stufe, 'offen');
});

test('Rechte: publishable lässt fremde Lieder weg, außer sie sind freigegeben', () => {
  const it = { ...lied('Jingle bell rock'), sig: 'x', downloads: [] };
  const rechte = { titel: { 'jingle bell rock': { fakten: JBR } } };
  const katalog = { items: [it] };
  const ohne = publishable(katalog, {}, {}, rechte);
  assert.equal(ohne.skipped.rechte, 1);
  const frei = publishable(katalog, {}, {}, rechte, [it.id]);
  assert.equal(frei.skipped.rechte, 0);
});

test('Rechte: Ein-Wort-Titel werden nie ausgeblendet, nur zum Ansehen gelistet', () => {
  assert.equal(einstufen(181, 2, 1), 'verdacht'); // Hush (Kevin MacLeod, eigenes Stück)
  assert.equal(einstufen(324, 3, 3), 'fremd'); // Jingle Bell Rock
});

test('Rechteprüfung: mehrere Titel in einer Suche, eine zu große Suche wird geteilt', async () => {
  const { faktenFuer } = await import('../crawler/rechtecheck.mjs');
  const w = (title, aufnahmen, autoren = []) => ({
    id: `${title}/${aufnahmen}`,
    title,
    relations: [...autoren.map((name) => ({ type: 'writer', artist: { id: name, name } })), { type: 'publishing', artist: { id: 'v', name: 'Verlag' } }, ...Array.from({ length: aufnahmen }, () => ({ type: 'performance', recording: { id: 'r' } }))],
  });
  const index = [w('Jingle Bell Rock', 1), w('Jingle Bell Rock', 30, ['Joe Beal', 'Jim Boothe']), ...Array.from({ length: 150 }, (_, i) => w(i < 120 ? 'Love' : `Love ${i}`, 1))];
  const anfragen = [];
  const suchen = async (titel) => {
    anfragen.push(titel);
    const alle = index.filter((x) => titel.some((t) => x.title.toLowerCase().includes(t)));
    return { count: alle.length, works: alle.slice(0, 100) };
  };
  const ablage = await faktenFuer(['jingle bell rock', 'ein titel den es nicht gibt', 'love', 'noch einer'], new Map(), suchen);
  assert.equal(anfragen.length, 5); // alle vier, dann zwei Hälften, dann die zweite Hälfte einzeln
  const jbr = ablage.get('jingle bell rock');
  assert.equal(jbr.gleichnamig, 2);
  assert.equal(jbr.werke[0].aufnahmen, 30); // das mit den meisten Aufnahmen zuerst
  assert.deepEqual(jbr.werke[0].autoren.map((a) => a.name), ['Joe Beal', 'Jim Boothe']); // der Verlag ist kein Urheber
  assert.deepEqual(ablage.get('ein titel den es nicht gibt'), { gleichnamig: 0, werke: [] });
  assert.equal(ablage.get('love').gleichnamig, 150); // alle gelieferten heißen so: die Zahl der Suche gilt
  assert.equal(ablage.get('noch einer').gleichnamig, 0);
});

test('Rechteprüfung: Bündel halten Titelzahl und Adresslänge ein, kurze Titel in kleinen Bündeln', async () => {
  const { buendeln } = await import('../crawler/rechtecheck.mjs');
  const lang = Array.from({ length: 45 }, (_, i) => `ein langer titel nummer ${i}`);
  const kurz = Array.from({ length: 9 }, (_, i) => `wort${i}`);
  const b = buendeln([...lang, ...kurz]);
  assert.deepEqual(b.map((x) => x.length).sort((x, y) => y - x), [20, 20, 5, 4, 4, 1]);
  assert.equal(b.flat().length, 54);
  const kyrillisch = Array.from({ length: 30 }, (_, i) => `эй ухнем фёдор шаляпин песня волжских бурлаков ${i}`);
  for (const x of buendeln(kyrillisch)) assert.ok(encodeURIComponent(x.join(' ')).length < 3000);
});
