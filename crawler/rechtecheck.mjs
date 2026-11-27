// Rights check for music (see crawler/lib/rechte.mjs): looks up the title of every music entry once at
// MusicBrainz and keeps the facts in data/rechtecheck.json, keyed by the normalised title. One work search asks for
// up to 20 titles at once and already carries the writers and the recordings of every work; a writer's life dates
// are fetched only where the verdict can depend on them. crawler/publish.mjs keeps entries judged "fremd" out
// of the catalogue; reports/rechtecheck.md lists them and the ones worth a look.
//
//   node crawler/rechtecheck.mjs                    titles not looked up yet, at most 30 minutes
//   node crawler/rechtecheck.mjs --max-minuten 600  longer run (first pass)
//   node crawler/rechtecheck.mjs --nur-bericht      only rewrite the report from the stored facts
//   node crawler/rechtecheck.mjs --treffer-neu      also look up again what the first method (one title per search,
//                                                   25 works) found works for; the bundled search counts more exactly
//
// MusicBrainz asks for at most one request per second and an identifying User-Agent (lib/http.mjs).
// A failed lookup is never stored, so it is tried again: in a second and third round of the same run (MusicBrainz
// answers about one search in ten with "busy"), then next run.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { getJson, setHostGap } from './lib/http.mjs';
import { ladeKatalog } from './lib/store.mjs';
import { SOURCES } from './sources/index.mjs';
import { titelNormal, urteil, einstufen } from './lib/rechte.mjs';

const API = 'https://musicbrainz.org/ws/2';
const DATEI = 'data/rechtecheck.json';
const AUTORENROLLEN = new Set(['composer', 'lyricist', 'writer', 'librettist']);
// One search: at most this many titles and this many characters in the address. MusicBrainz returns 100 works at most.
const BUENDEL = 20;
const BUENDEL_KURZ = 4; // titles of one or two words match many works and would swamp a large bundle
const BUENDEL_ZEICHEN = 3000;
const SEITE = 100;
// checked first: uploads with the least moderation
const REIHENFOLGE = ['openverse', 'internetarchive', 'opengameart', 'github', 'commonsaudio'];

const jahrAus = (d) => (d ? Number(String(d).slice(0, 4)) || undefined : undefined);

export async function ladeRechte() {
  try { return JSON.parse(await readFile(DATEI, 'utf8')); } catch { return { titel: {}, autoren: {} }; }
}

async function autor(stand, id, name) {
  if (stand.autoren[id]) return stand.autoren[id];
  const a = await getJson(`${API}/artist/${id}?fmt=json`);
  const eintrag = { name: a.name ?? name, tod: jahrAus(a['life-span']?.end), geboren: jahrAus(a['life-span']?.begin), typ: a.type };
  // groups and companies have no life span that counts for the term; only people are judged
  if (a.type && a.type !== 'Person') { delete eintrag.tod; delete eintrag.geboren; }
  stand.autoren[id] = eintrag;
  return eintrag;
}

const suchenBeiMusicBrainz = (titel) =>
  getJson(`${API}/work/?query=${encodeURIComponent(titel.map((t) => `work:"${t}"`).join(' OR '))}&fmt=json&limit=${SEITE}`);

const heisst = (w, t) => [w.title, ...(w.aliases ?? []).map((a) => a.name)].some((x) => titelNormal(x) === t);

/** What a search result says about one work: its writers by name and how many recordings it has. */
function werkAus(w) {
  const rel = w.relations ?? [];
  const autoren = [];
  for (const r of rel) {
    if (!r.artist || !AUTORENROLLEN.has(r.type) || autoren.some((a) => a.id === r.artist.id)) continue;
    autoren.push({ id: r.artist.id, name: r.artist.name });
  }
  return { id: w.id, titel: w.title, aufnahmen: rel.filter((r) => r.recording).length, iswc: (w.iswcs ?? []).length > 0, autoren };
}

/**
 * Facts for several titles from as few searches as possible, written into `ablage` (title -> { gleichnamig, werke }).
 * A search that returns everything it found answers every title in it at once. One that found more than it returns
 * is split in two, down to the single title, where the old rule holds: if all returned works carry the title, the
 * count of the search is the number of works of that name. Titles answered before an error stay in `ablage`.
 */
export async function faktenFuer(titel, ablage, suchen = suchenBeiMusicBrainz) {
  const suche = await suchen(titel);
  if (!Array.isArray(suche.works)) throw new Error('Antwort ohne works');
  const alles = !(suche.count > suche.works.length);
  if (!alles && titel.length > 1) {
    const mitte = titel.length >> 1;
    await faktenFuer(titel.slice(0, mitte), ablage, suchen);
    await faktenFuer(titel.slice(mitte), ablage, suchen);
    return ablage;
  }
  for (const t of titel) {
    // works with this exact title: one or two means the title names a particular song, many ("Meditation":
    // hundreds) means it is a common word and says nothing about which song it is
    const gleich = suche.works.filter((w) => heisst(w, t));
    const gleichnamig = !alles && gleich.length === suche.works.length ? suche.count : gleich.length;
    // the three with the most recordings: the well-known song is the one a verdict can rest on
    ablage.set(t, { gleichnamig, werke: gleich.map(werkAus).sort((a, b) => b.aufnahmen - a.aufnahmen).slice(0, 3) });
  }
  return ablage;
}

/**
 * Adds the writers' life dates where the verdict can depend on them (lib/rechte.mjs einstufen: few works of that
 * name and enough recordings). Everywhere else the names are enough: they still tell an uploader who is the writer.
 * Such a work is marked ohneDaten, so a later change of the thresholds can tell what was never looked up.
 */
async function mitLebensdaten(stand, f) {
  for (const w of f.werke) {
    if (!einstufen(w.aufnahmen, f.gleichnamig)) { if (w.autoren.length) w.ohneDaten = true; continue; }
    for (let i = 0; i < w.autoren.length; i++) w.autoren[i] = { id: w.autoren[i].id, ...(await autor(stand, w.autoren[i].id, w.autoren[i].name)) };
  }
  return f;
}

/** The facts for one title (a search of its own). */
export async function fakten(stand, t, suchen = suchenBeiMusicBrainz) {
  return mitLebensdaten(stand, (await faktenFuer([t], new Map(), suchen)).get(t));
}

/** Titles in their order, packed into searches: short titles in small bundles, no address longer than it should be. */
export function buendeln(titel) {
  const fertig = [];
  const offen = { kurz: [], lang: [] };
  const laenge = (b) => b.reduce((n, t) => n + encodeURIComponent(t).length + 30, 0);
  for (const t of titel) {
    const art = t.split(' ').length <= 2 ? 'kurz' : 'lang';
    const b = offen[art];
    if (b.length && laenge([...b, t]) > BUENDEL_ZEICHEN) { fertig.push(b.splice(0)); }
    b.push(t);
    if (b.length >= (art === 'kurz' ? BUENDEL_KURZ : BUENDEL)) fertig.push(b.splice(0));
  }
  for (const b of Object.values(offen)) if (b.length) fertig.push(b);
  return fertig;
}

function bericht(items, stand, frei = new Set()) {
  const zeilen = { fremd: [], verdacht: [] };
  let offen = 0;
  for (const it of items) {
    if (frei.has(it.id)) continue;
    const u = urteil(it, stand.titel[titelNormal(it.title)]?.fakten);
    if (u.stufe === 'offen') offen++;
    if (zeilen[u.stufe]) zeilen[u.stufe].push(`| ${it.title.replace(/\|/g, '/')} | ${it.creator?.name ?? ''} | [${it.source.name}](${it.source.url}) | ${u.grund} | \`${it.id}\` |`);
  }
  const tabelle = (z) => (z.length ? ['| Titel | Hochgeladen von | Quelle | Grund | ID |', '|---|---|---|---|---|', ...z].join('\n') : 'keine');
  return `# Rechteprüfung Musik

Stand ${new Date().toISOString().slice(0, 10)}. ${items.length} Musikeinträge, davon ${offen} noch nicht geprüft.
Eine CC-Lizenz bei Jamendo, im Internet Archive oder auf Commons ist eine Angabe des Hochladers. Diese Prüfung findet
nur den offensichtlichen Fall: Der Titel ist ein bekanntes, noch geschütztes Lied (Urheber leben oder sind vor weniger
als 70 Jahren gestorben), hochgeladen von jemandem, der nicht zu den Urhebern gehört. Grundlage ist MusicBrainz.

## Ausgeblendet (${zeilen.fremd.length})

Bekannte Lieder mit vielen Aufnahmen. Sie erscheinen nicht im Katalog. Ist ein Eintrag doch in Ordnung, die ID in
\`crawler/config.json\` unter \`"rechte": { "freigegeben": [] }\` eintragen.

${tabelle(zeilen.fremd)}

## Zum Ansehen (${zeilen.verdacht.length})

Geschütztes Werk mit wenigen Aufnahmen oder ein Hinweis auf ein Cover. Sie bleiben im Katalog. Wer einen Treffer
bestätigt, trägt die ID mit Grund in \`data/gesperrt.json\` ein.

${tabelle(zeilen.verdacht)}
`;
}

async function main() {
  const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
  const ende = Date.now() + (Number(arg('--max-minuten')) || 30) * 60000;
  const { items } = await ladeKatalog(SOURCES.map((s) => s.id));
  const musik = items.filter((it) => it.kind === 'musik');
  const stand = await ladeRechte();
  setHostGap('musicbrainz.org', 1100);

  if (!process.argv.includes('--nur-bericht')) {
    const rang = (it) => { const i = REIHENFOLGE.indexOf(it.source.id); return i < 0 ? REIHENFOLGE.length : i; };
    const nochmal = process.argv.includes('--treffer-neu');
    const fehlt = (t) => !stand.titel[t] || (nochmal && !stand.titel[t].v && stand.titel[t].fakten.gleichnamig > 0);
    const alle = [...new Set([...musik].sort((a, b) => rang(a) - rang(b)).map((it) => titelNormal(it.title)))]
      .filter((t) => t.length >= 3 && /\p{L}/u.test(t));
    let titel = alle.filter(fehlt);
    console.log(`Rechteprüfung: ${titel.length} Titel offen von ${musik.length} Musikeinträgen`);
    let hintereinander = 0, suchen = 0, runde = 0;
    const gezaehlt = (b) => { suchen++; return suchenBeiMusicBrainz(b); };
    const neu = new Set();
    durchgaenge: for (let durchgang = 1; durchgang <= 3 && titel.length; durchgang++) {
      for (const b of buendeln(titel)) {
        if (Date.now() > ende) break durchgaenge;
        const ablage = new Map();
        let fehlschlag = null;
        try { await faktenFuer(b, ablage, gezaehlt); } catch (err) { fehlschlag = err; }
        for (const [t, f] of ablage) {
          try {
            stand.titel[t] = { fakten: await mitLebensdaten(stand, f), am: new Date().toISOString().slice(0, 10), v: 2 };
            neu.add(t);
          } catch (err) { fehlschlag = err; }
        }
        hintereinander = fehlschlag ? hintereinander + 1 : 0;
        if (hintereinander >= 10) { console.log(`  zehn Fehler hintereinander, Abbruch (${fehlschlag.message})`); break durchgaenge; }
        if (++runde % 20 === 0) { await writeFile(DATEI, JSON.stringify(stand)); console.log(`  ${neu.size} Titel geprüft, ${suchen} Suchen`); }
      }
      titel = titel.filter((t) => !neu.has(t));
      if (titel.length) console.log(`  Durchgang ${durchgang}: ${titel.length} Titel ohne Antwort`);
    }
    const offen = alle.filter(fehlt).filter((t) => !neu.has(t)).length;
    await writeFile(DATEI, JSON.stringify(stand));
    console.log(`Fertig: ${neu.size} Titel geprüft mit ${suchen} Suchen, ${offen} bleiben für den nächsten Lauf.`);
  }

  await mkdir('reports', { recursive: true });
  const frei = new Set(JSON.parse(await readFile('crawler/config.json', 'utf8')).rechte?.freigegeben ?? []);
  await writeFile('reports/rechtecheck.md', bericht(musik, stand, frei));
}

if (process.argv[1]?.endsWith('rechtecheck.mjs')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
