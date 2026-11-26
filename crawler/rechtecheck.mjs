// Rights check for music (see crawler/lib/rechte.mjs): looks up the title of every music entry once at
// MusicBrainz (work search, then writers with their life dates and the number of recordings) and keeps the facts
// in data/rechtecheck.json, keyed by the normalised title. crawler/publish.mjs keeps entries judged "fremd" out
// of the catalogue; reports/rechtecheck.md lists them and the ones worth a look.
//
//   node crawler/rechtecheck.mjs                    titles not looked up yet, at most 30 minutes
//   node crawler/rechtecheck.mjs --max-minuten 600  longer run (first pass)
//   node crawler/rechtecheck.mjs --nur-bericht      only rewrite the report from the stored facts
//
// MusicBrainz asks for at most one request per second and an identifying User-Agent (lib/http.mjs).
// A failed lookup is never stored, so it is tried again next run.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { getJson, setHostGap } from './lib/http.mjs';
import { ladeKatalog } from './lib/store.mjs';
import { SOURCES } from './sources/index.mjs';
import { titelNormal, urteil } from './lib/rechte.mjs';

const API = 'https://musicbrainz.org/ws/2';
const DATEI = 'data/rechtecheck.json';
const AUTORENROLLEN = new Set(['composer', 'lyricist', 'writer', 'librettist']);
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

export async function fakten(stand, t) {
  const suche = await getJson(`${API}/work/?query=${encodeURIComponent(`work:"${t}"`)}&fmt=json&limit=25`);
  if (!Array.isArray(suche.works)) throw new Error('Antwort ohne works');
  // works with this exact title, whatever their score: one or two means the title names a particular song,
  // many ("Meditation": hundreds) means it is a common word and says nothing about which song it is
  const gleich = suche.works.filter((w) => [w.title, ...(w.aliases ?? []).map((a) => a.name)].some((x) => titelNormal(x) === t));
  const gleichnamig = gleich.length === suche.works.length && suche.count > suche.works.length ? suche.count : gleich.length;
  const passend = gleich.filter((w) => w.score >= 85).slice(0, 3);
  const werke = [];
  for (const w of passend) {
    const voll = await getJson(`${API}/work/${w.id}?inc=artist-rels+recording-rels&fmt=json`);
    const rel = voll.relations ?? [];
    const autoren = [];
    for (const r of rel.filter((r) => r['target-type'] === 'artist' && AUTORENROLLEN.has(r.type))) {
      if (autoren.some((a) => a.id === r.artist.id)) continue;
      autoren.push({ id: r.artist.id, ...(await autor(stand, r.artist.id, r.artist.name)) });
    }
    werke.push({ id: w.id, titel: voll.title, aufnahmen: rel.filter((r) => r['target-type'] === 'recording').length, iswc: (voll.iswcs ?? []).length > 0, autoren });
  }
  return { gleichnamig, werke };
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
    const titel = [...new Set([...musik].sort((a, b) => rang(a) - rang(b)).map((it) => titelNormal(it.title)))]
      .filter((t) => t.length >= 3 && /\p{L}/u.test(t) && !stand.titel[t]);
    console.log(`Rechteprüfung: ${titel.length} Titel offen von ${musik.length} Musikeinträgen`);
    let n = 0, fehler = 0, hintereinander = 0;
    for (const t of titel) {
      if (Date.now() > ende) break;
      try {
        stand.titel[t] = { fakten: await fakten(stand, t), am: new Date().toISOString().slice(0, 10) };
        hintereinander = 0;
      } catch (err) {
        fehler++;
        if (++hintereinander >= 10) { console.log(`  zehn Fehler hintereinander, Abbruch (${err.message})`); break; }
      }
      if (++n % 25 === 0) { await writeFile(DATEI, JSON.stringify(stand)); console.log(`  ${n} Titel geprüft`); }
    }
    await writeFile(DATEI, JSON.stringify(stand));
    console.log(`Fertig: ${n - fehler} Titel geprüft, ${fehler} Fehler, ${titel.length - n} auf den nächsten Lauf vertagt.`);
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
