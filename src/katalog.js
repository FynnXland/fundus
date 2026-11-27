// Catalogue data in the browser. What loads when (file layout: crawler/lib/ausgabe.mjs):
//   stand.json + start.json            at once: counts, which parts and tiles exist, a mixed sample
//   index/<art>/kopf.json              the best rows of a kind (order "empfohlen"): a folder can show them at once
//   index/<art>/<nn>.json              parts of 500 rows, ordered by subfolder: a subfolder or a search loads few
//   suche/k_<key>.json                 search tiles, loaded for the words of a query; the hits are row numbers
//   karten/<xx>.json                   one shard per opened detail sheet; it names the index part of its entry
//   index/<art>/gruppen.json           the groups of a kind (name, size, pictures, parts), for the folder cards
//
// Two modes. Without beimNachladen() every need is complete before hole() resolves, so a filter always sees
// all rows it needs. With beimNachladen(k, fn) a folder (or "alle") resolves after its head; the rest loads in
// the background and fn(was) is called once when it is there. Anything that needs all rows to be right (a
// licence, format or source filter, another sort order) stays complete in both modes.
import { woerter, kachelnFuer, kachelDatei, suche, rangfolge } from '../crawler/lib/suchindex.mjs';

export const ARTEN = {
  bild: { label: 'Bilder', einzahl: 'Bild' },
  grafik: { label: '2D-Grafik & Sprites', einzahl: '2D-Grafik' },
  '3d': { label: '3D-Modelle', einzahl: '3D-Modell' },
  textur: { label: 'Materialien', einzahl: 'Material' },
  hdri: { label: 'Umgebungen & Licht', einzahl: 'Umgebung' },
  icon: { label: 'Icons & UI', einzahl: 'Icon-Set' },
  musik: { label: 'Musik', einzahl: 'Musikstück' },
  sound: { label: 'Sounds', einzahl: 'Sound' },
  schrift: { label: 'Schriften', einzahl: 'Schrift' },
  skript: { label: 'Skripte & Add-ons', einzahl: 'Skript' },
  projekt: { label: 'Projekte', einzahl: 'Projekt' },
  skill: { label: 'Claude-Skills', einzahl: 'Claude-Skill' },
  video: { label: 'Videos', einzahl: 'Video' },
  shader: { label: 'Shader', einzahl: 'Shader' },
};

export const LIZENZGRUPPEN = {
  alle: 'Alle offenen Lizenzen',
  frei: 'Ohne Namensnennung',
  nennung: 'Mit Namensnennung',
  gleich: 'Gleiche Bedingungen (SA, GPL)',
};

// empfohlen is the default: best rated first, then most popular (per source), then mixed. Only the head of a
// folder is needed for it, because the head holds the best rows. bewertung puts rated entries first (best by
// Bayesian mean, see crawler/lib/bewertung.mjs), the rest follows mixed; it needs every row of the folder.
export const STANDARD_SORT = 'empfohlen';
export const SORTIERUNGEN = {
  empfohlen: 'Empfohlen',
  bewertung: 'Beste Bewertung',
  gemischt: 'Gemischt',
  neu: 'Neueste zuerst',
  name: 'Name A bis Z',
  quelle: 'Nach Quelle',
};

const VORDERGRUND = 6; // requests at once when the visitor waits
const HINTERGRUND = 3; // requests at once while the visitor already sees something
const MERKEN = 30; // searches kept

async function holeJson(pfad) {
  const res = await fetch(pfad);
  if (!res.ok) throw new Error(`Katalogdaten nicht erreichbar (${pfad}: HTTP ${res.status})`);
  return res.json();
}

/** Runs the jobs with at most `parallel` at once; the first error stops the rest and is thrown. */
async function pool(aufgaben, parallel) {
  let i = 0;
  let fehler = null;
  const arbeiter = Array.from({ length: Math.min(parallel, aufgaben.length) }, async () => {
    while (!fehler && i < aufgaben.length) {
      try { await aufgaben[i++](); } catch (err) { fehler ??= err; }
    }
  });
  await Promise.all(arbeiter);
  if (fehler) throw fehler;
}

const mix = (a, b) => (a.m < b.m ? -1 : a.m > b.m ? 1 : a.id < b.id ? -1 : 1);
// rang caps popularity at the 99th percentile and rounds it, so the count itself (stars, downloads) breaks ties:
// the most starred projects come in the exact order of their stars
const empfohlen = (a, b) => b.rang - a.rang || (b.beliebtheit?.wert ?? 0) - (a.beliebtheit?.wert ?? 0) || mix(a, b);

/** One row as an object. art, quellname and gruppe are not in the files (smaller rows), they are added here. */
function zeileBauen(k, felder, z, art) {
  const o = {};
  for (let i = 0; i < felder.length; i++) o[felder[i]] = z[i];
  o.art ??= art;
  o.quellname = k.quellnamen.get(o.quelle) ?? o.quelle;
  o.gruppe = k.gruppen[o.lizenz] ?? '';
  o.m = o.sig.slice(-5); // position in the mixed order
  // rating and popularity as the display uses them (the raw row fields bew and pop are dropped)
  o.bewertung = o.bew ? { sterne: o.bew[0], anzahl: o.bew[1], quelle: o.bew[2] } : undefined;
  o.beliebtheit = o.pop ? { wert: o.pop[0], label: o.pop[1] } : undefined;
  o.rang ??= 0;
  // member of a group: serie = group id, serieAnzahl = its size (name and pictures: gruppeVon)
  const s = o.serie;
  o.serie = s ? s[0] : '';
  o.serieAnzahl = s ? s[1] : 0;
  delete o.bew;
  delete o.pop;
  return o;
}

/** Registers the rows of a file; a row that is already known (head, then part) keeps its object. */
function aufnehmen(k, art, d) {
  const liste = k.proArt.get(art);
  const iId = d.felder.indexOf('id');
  return d.zeilen.map((z) => {
    let o = k.byId.get(z[iId]);
    if (!o) {
      o = zeileBauen(k, d.felder, z, art);
      k.byId.set(o.id, o);
      liste.push(o);
    }
    return o;
  });
}

// The catalogue of this page. ladeKarte() loads the index part of the opened entry into it, so that
// "similar entries" have rows to work with.
let aktuell = null;

/** Loads counts and the start sample. Folders follow through hole(). */
export async function ladeKatalog() {
  const [stand, start] = await Promise.all([holeJson('/data/stand.json'), holeJson('/data/start.json')]);
  const ix = stand.index;
  if (!ix) throw new Error('Die Katalogdaten haben noch das alte Format (npm run daten erzeugt sie neu)');
  const k = {
    stand,
    start: [],
    arten: new Map(), // art -> { anzahl, kopfAnzahl, unter, start, ende, teile, kopf, fertig }
    bloecke: [], // all parts in ref order, for the lookup row number -> part
    proArt: new Map(), // art -> loaded rows
    byId: new Map(),
    quellnamen: new Map(stand.sources.map((s) => [s.id, s.name])),
    gruppen: ix.lizenzgruppen,
    schluessel: ix.kacheln,
    kacheln: new Map(),
    kachelLauf: new Map(),
    suchen: new Map(), // was -> row numbers of the hits, ranked
    laeuft: new Map(),
    hinten: new Map(),
    nachladen: null,
    sortiert: new Map(),
    alleMerk: null,
    serienArten: ix.gruppen ?? {}, // art -> number of groups, only kinds that have a gruppen.json
    serien: new Map(), // art -> Map id -> group
    serienLauf: new Map(),
  };
  let ref = 0;
  for (const e of ix.arten) {
    // kopf2Anzahl > 0 marks a big kind (crawler/lib/ausgabe.mjs GROSS): it has a second head and never loads in full by itself
    const a = { art: e.art, anzahl: e.anzahl, kopfAnzahl: e.kopf, kopf2Anzahl: e.kopf2 ?? 0, unter: e.unter, start: ref, ende: ref + e.anzahl, teile: [], kopf: false, kopfLauf: null, kopf2: false, kopf2Lauf: null, fertig: false };
    let von = ref;
    e.teile.forEach(([n, u0, u1], nr) => {
      const t = { art: e.art, nr, anzahl: n, von: u0, bis: u1, start: von, zeilen: null, lauf: null };
      von += n;
      a.teile.push(t);
      k.bloecke.push(t);
    });
    ref += e.anzahl;
    k.arten.set(e.art, a);
    k.proArt.set(e.art, []);
  }
  k.start = start.zeilen.map((z) => zeileBauen(k, start.felder, z, null));
  aktuell = k;
  return k;
}

/** From now on a folder shows its head at once and fn(was) is called when the rest has loaded. */
export function beimNachladen(k, fn) {
  k.nachladen = fn;
}

/* ---------------- Loading ---------------- */

function ladeKopf(k, art) {
  const a = k.arten.get(art);
  if (!a || a.kopf) return Promise.resolve();
  a.kopfLauf ??= holeJson(`/data/index/${art}/kopf.json`)
    .then((d) => {
      aufnehmen(k, art, d);
      a.kopf = true;
      if (d.zeilen.length >= a.anzahl) a.fertig = true; // a small kind is only a head
    })
    .finally(() => { a.kopfLauf = null; });
  return a.kopfLauf;
}

/**
 * The second head of a big kind: the next best rows after the head. true while there is one left to load, so the
 * list knows whether scrolling on can bring more.
 */
export const hatKopf2 = (k, art) => { const a = k.arten.get(art); return Boolean(a && a.kopf2Anzahl && !a.kopf2 && !a.fertig); };
export function ladeKopf2(k, art) {
  const a = k.arten.get(art);
  if (!a || !a.kopf2Anzahl || a.kopf2 || a.fertig) return Promise.resolve();
  a.kopf2Lauf ??= holeJson(`/data/index/${art}/kopf2.json`)
    .then((d) => { aufnehmen(k, art, d); a.kopf2 = true; })
    .finally(() => { a.kopf2Lauf = null; });
  return a.kopf2Lauf;
}
/** A big kind shown without all its rows: the list ends after the heads and says so. */
export const nurKoepfe = (k, art) => { const a = k.arten.get(art); return Boolean(a && a.kopf2Anzahl && !a.fertig); };

function ladeTeil(k, a, t) {
  if (t.zeilen) return Promise.resolve();
  t.lauf ??= holeJson(`/data/index/${a.art}/${String(t.nr).padStart(2, '0')}.json`)
    .then((d) => {
      t.zeilen = aufnehmen(k, a.art, d);
      if (a.teile.every((x) => x.zeilen)) a.fertig = true;
    })
    .finally(() => { t.lauf = null; });
  return t.lauf;
}

function ladeVollstaendig(k, arten, parallel) {
  const aufgaben = [];
  for (const a of arten) {
    if (a.fertig) continue;
    if (a.anzahl <= a.kopfAnzahl) aufgaben.push(() => ladeKopf(k, a.art));
    else for (const t of a.teile) if (!t.zeilen) aufgaben.push(() => ladeTeil(k, a, t));
  }
  return pool(aufgaben, parallel);
}

const teileFuer = (a, unter) => {
  const u = a.unter.indexOf(unter);
  return u < 0 ? [] : a.teile.filter((t) => t.von <= u && u <= t.bis);
};

/** The groups of a kind (index/<art>/gruppen.json); kinds without groups need nothing. */
function ladeSerien(k, art) {
  if (k.serien.has(art) || !k.serienArten[art]) return Promise.resolve();
  if (!k.serienLauf.has(art)) {
    k.serienLauf.set(art, holeJson(`/data/index/${art}/gruppen.json`)
      .then((d) => { k.serien.set(art, new Map(Object.entries(d).map(([id, g]) => [id, { id, art, ...g }]))); })
      .finally(() => k.serienLauf.delete(art)));
  }
  return k.serienLauf.get(art);
}
const serienDa = (k, art) => !k.serienArten[art] || k.serien.has(art);
/** The kind of a group from its id ("3d.4f2a9c1e"). */
export const artVonSerie = (id) => String(id ?? '').split('.')[0];
/** A group: { id, art, name, anzahl, unter, teile, bilder, urheber, lizenz }, or null when unknown or not loaded. */
export const gruppeVon = (k, id) => k.serien.get(artVonSerie(id))?.get(id) ?? null;

function ladeKachel(k, s) {
  if (k.kacheln.has(s)) return Promise.resolve();
  if (!k.kachelLauf.has(s)) {
    k.kachelLauf.set(s, holeJson(`/data/suche/${kachelDatei(s)}`).then((d) => { k.kacheln.set(s, d); }).finally(() => k.kachelLauf.delete(s)));
  }
  return k.kachelLauf.get(s);
}

/** Tiles a word needs. One letter only matches exactly, so it needs the one tile that can hold it. */
const kachelnNoetig = (wort, schluessel) => (wort.length > 1 ? kachelnFuer(wort, schluessel) : kachelnFuer(wort, schluessel).filter((s) => wort.startsWith(s)));

function blockVon(k, ref) {
  let lo = 0;
  let hi = k.bloecke.length - 1;
  while (lo < hi) {
    const mitte = (lo + hi + 1) >> 1;
    if (k.bloecke[mitte].start <= ref) lo = mitte; else hi = mitte - 1;
  }
  return k.bloecke[lo];
}
const zeileVonRef = (k, ref) => { const t = k.bloecke.length ? blockVon(k, ref) : null; return t?.zeilen?.[ref - t.start]; };

async function sucheLaden(k, w, was) {
  const ws = [...new Set(woerter(w.q))];
  const noetig = new Set(ws.flatMap((x) => kachelnNoetig(x, k.schluessel)));
  await pool([...noetig].map((s) => () => ladeKachel(k, s)), VORDERGRUND);
  let refs = rangfolge(suche(w.q, k.kacheln, k.schluessel));
  const a = w.art ? k.arten.get(w.art) : null;
  if (w.art) refs = a ? refs.filter((r) => r >= a.start && r < a.ende) : [];
  // only the parts that hold hits (and, in a subfolder, only those that can hold the subfolder)
  const teile = new Map();
  for (const r of refs) { const t = blockVon(k, r); teile.set(t, k.arten.get(t.art)); }
  const unterIndex = a && w.unter ? a.unter.indexOf(w.unter) : -1;
  const zuLaden = [...teile].filter(([t]) => !w.unter || (t.von <= unterIndex && unterIndex <= t.bis));
  await pool(zuLaden.map(([t, art]) => () => ladeTeil(k, art, t)), VORDERGRUND);
  k.suchen.set(was, refs);
  if (k.suchen.size > MERKEN) k.suchen.delete(k.suchen.keys().next().value);
}

/* ---------------- What a filter needs ---------------- */

// A need is a string:
//   'start'                  the sample from start.json
//   '<art>' / 'alle'         the folder / everything; with '!' only when complete (filters that need every row)
//   '<art>|<unter>'          the parts of one subfolder
//   's|<art>|<unter>|<q>'    a search, restricted to the folder and subfolder when they are given
//   'g|<serie>'              the members of one group
// A folder shown grouped ends in '+g': the groups of its kinds load with it.
function zerlege(was) {
  if (was === 'start') return { typ: 'start' };
  if (was.startsWith('s|')) {
    const [, art, unter, ...q] = was.split('|');
    return { typ: 'suche', art, unter, q: q.join('|') };
  }
  if (was.startsWith('g|')) return { typ: 'serie', serie: was.slice(2), art: artVonSerie(was.slice(2)) };
  const gruppen = was.endsWith('+g');
  if (gruppen) was = was.slice(0, -2);
  if (was.includes('|')) {
    const [art, unter] = was.split('|');
    return { typ: 'unter', art, unter, gruppen };
  }
  const voll = was.endsWith('!');
  const name = voll ? was.slice(0, -1) : was;
  return name === 'alle' ? { typ: 'alle', voll, gruppen } : { typ: 'art', art: name, voll, gruppen };
}

/** What a filter needs before it can be shown. gruppiert: folders show a group as one card (a search never does). */
export function bedarf(f, wurzelAlle = false, gruppiert = false) {
  const q = f.q?.trim();
  if (q) return `s|${f.art ?? ''}|${f.art ? f.unter ?? '' : ''}|${q}`;
  if (f.serie) return `g|${f.serie}`;
  const g = gruppiert ? '+g' : '';
  if (f.art && f.unter) return `${f.art}|${f.unter}${g}`;
  // the head of a folder is its best rows (empfohlen); every other order needs all rows to be right
  const voll = (f.lizenz && f.lizenz !== 'alle') || f.format || f.quelle || (f.sort && f.sort !== STANDARD_SORT) ? '!' : '';
  if (f.art) return f.art + voll + g;
  // the start sample is a deliberate mix of all kinds and stays single cards
  return voll ? `alle!${g}` : wurzelAlle ? `alle${g}` : 'start';
}

const genug = (k, a, voll) => !a || a.fertig || (Boolean(k.nachladen) && !voll && a.kopf);

const teileDerSerie = (k, w) => {
  const a = k.arten.get(w.art);
  const g = gruppeVon(k, w.serie);
  return a && g ? g.teile.map((n) => a.teile[n]).filter(Boolean) : [];
};

export function hat(k, was) {
  const w = zerlege(was);
  const serien = (arten) => !w.gruppen || arten.every((art) => serienDa(k, art));
  switch (w.typ) {
    case 'start': return true;
    case 'suche': return k.suchen.has(was);
    case 'serie': { const a = k.arten.get(w.art); return !a || (serienDa(k, w.art) && (a.fertig || teileDerSerie(k, w).every((t) => t.zeilen))); }
    case 'unter': { const a = k.arten.get(w.art); return serien([w.art]) && (!a || a.fertig || teileFuer(a, w.unter).every((t) => t.zeilen)); }
    case 'art': return serien([w.art]) && genug(k, k.arten.get(w.art), w.voll);
    default: return serien([...k.arten.keys()]) && [...k.arten.values()].every((a) => genug(k, a, w.voll));
  }
}

function hintergrund(k, alle, was) {
  // a big kind stays at its heads: all parts of Projekte are 94 MB, nobody scrolls that far
  const arten = alle.filter((a) => !a.kopf2Anzahl);
  if (k.hinten.has(was) || arten.every((a) => a.fertig)) return;
  k.hinten.set(
    was,
    ladeVollstaendig(k, arten, HINTERGRUND)
      .then(() => k.nachladen?.(was))
      .catch(() => {}) // a failed rest stays a head; the next visit asks again
      .finally(() => k.hinten.delete(was)),
  );
}

async function holeEcht(k, was) {
  const w = zerlege(was);
  if (w.typ === 'suche') return sucheLaden(k, w, was);
  if (w.typ === 'serie') {
    const a = k.arten.get(w.art);
    if (!a) return undefined;
    await ladeSerien(k, w.art);
    if (a.fertig) return undefined;
    // an unknown group (old link, newer data) has no parts and shows an empty folder
    return pool(teileDerSerie(k, w).map((t) => () => ladeTeil(k, a, t)), VORDERGRUND);
  }
  if (w.gruppen) {
    const welche = w.typ === 'alle' ? [...k.arten.keys()] : [w.art];
    await pool(welche.map((art) => () => ladeSerien(k, art)), VORDERGRUND);
  }
  if (w.typ === 'unter') {
    const a = k.arten.get(w.art);
    if (!a || a.fertig) return undefined;
    return pool(teileFuer(a, w.unter).map((t) => () => ladeTeil(k, a, t)), VORDERGRUND);
  }
  const arten = w.typ === 'alle' ? [...k.arten.values()] : [k.arten.get(w.art)].filter(Boolean);
  if (k.nachladen && !w.voll) {
    await pool(arten.map((a) => () => ladeKopf(k, a.art)), VORDERGRUND);
    hintergrund(k, arten, was);
    return undefined;
  }
  return ladeVollstaendig(k, arten, VORDERGRUND);
}

export function hole(k, was) {
  if (was === 'start') return Promise.resolve();
  if (!k.laeuft.has(was)) k.laeuft.set(was, holeEcht(k, was).finally(() => k.laeuft.delete(was)));
  return k.laeuft.get(was);
}

/** The head of a kind. */
export async function ladeArt(k, art) {
  await ladeKopf(k, art);
  return geordnet(k, art);
}

/** Every row of every kind, mixed. */
export async function ladeAlle(k) {
  await ladeVollstaendig(k, [...k.arten.values()], VORDERGRUND);
  return alleGeordnet(k);
}

/* ---------------- Filtering ---------------- */

/** The loaded rows of a kind in the recommended order (sorted again only when rows were added). */
function geordnet(k, art) {
  const liste = k.proArt.get(art) ?? [];
  const m = k.sortiert.get(art);
  if (m?.n === liste.length) return m.liste;
  const neu = [...liste].sort(empfohlen);
  k.sortiert.set(art, { n: liste.length, liste: neu });
  return neu;
}

/**
 * Every loaded row of every kind. rang only compares within a kind (pictures, icons and fonts have none), so the
 * kinds are interleaved by position: the best of each kind, then the second best of each, and so on; the mixed
 * order decides within one position. That is the same idea as the start sample.
 */
function alleGeordnet(k) {
  const n = [...k.proArt.keys()].reduce((s, art) => s + k.proArt.get(art).length, 0);
  if (k.alleMerk?.n === n) return k.alleMerk.liste;
  const mitPlatz = [];
  for (const art of k.proArt.keys()) geordnet(k, art).forEach((o, i) => mitPlatz.push([i, o]));
  mitPlatz.sort((a, b) => a[0] - b[0] || mix(a[1], b[1]));
  k.alleMerk = { n, liste: mitPlatz.map((e) => e[1]) };
  return k.alleMerk.liste;
}

const vergleiche = {
  empfohlen,
  gemischt: mix,
  bewertung: (a, b) => Number(Boolean(b.bewertung)) - Number(Boolean(a.bewertung)) || (a.bewertung ? empfohlen(a, b) : mix(a, b)),
  neu: (a, b) => (a.neu < b.neu ? 1 : a.neu > b.neu ? -1 : 0),
  name: (a, b) => a.titel.localeCompare(b.titel, 'de'),
  quelle: (a, b) => a.quellname.localeCompare(b.quellname, 'de') || a.titel.localeCompare(b.titel, 'de'),
};

const titelOrdnung = (a, b) => a.titel.localeCompare(b.titel, 'de', { numeric: true, sensitivity: 'base' });

/** Filters what is loaded; call hole() first. Returns { liste, auswahl } where auswahl marks the start sample. */
export function filtern(k, { q, art, unter, lizenz, format, quelle, sort, serie }, wurzelAlle = false) {
  const was = bedarf({ q, art, unter, lizenz, format, quelle, sort }, wurzelAlle);
  let liste;
  if (q?.trim()) liste = (k.suchen.get(was) ?? []).map((r) => zeileVonRef(k, r)).filter(Boolean);
  // the members of a group in their natural order: "Vase 2" before "Vase 10"
  else if (serie) liste = (k.proArt.get(artVonSerie(serie)) ?? []).filter((o) => o.serie === serie).sort(titelOrdnung);
  else if (art) liste = geordnet(k, art);
  else liste = was === 'start' ? k.start : alleGeordnet(k);
  if (art && unter && !serie) liste = liste.filter((o) => o.unter === unter);
  if (lizenz && lizenz !== 'alle') liste = liste.filter((o) => o.gruppe === lizenz);
  if (format) liste = liste.filter((o) => o.formate.split(' ').includes(format));
  if (quelle) liste = liste.filter((o) => o.quelle === quelle);
  // the base order is already "empfohlen"; the start sample and search hits (ranked by relevance) keep theirs unless the
  // visitor picks another order
  if (sort && sort !== STANDARD_SORT && vergleiche[sort]) liste = [...liste].sort(vergleiche[sort]);
  return { liste, auswahl: was === 'start' };
}

/**
 * The cards of a folder: the members of a group become one card where its first member stands. Returns a list of
 * { o } (single entry) and { gruppe, n, o } (folder card: the group, its size here, its first member here).
 * Size here: with a licence, format or source filter the members in the list (it is complete then, and the opened
 * group applies the same filters), else the whole group, also in a subfolder, because opening it shows every
 * member. A group with one member here is a single card.
 */
export function zusammenfassen(k, liste, { lizenz, format, quelle } = {}) {
  const zeilenfilter = (lizenz && lizenz !== 'alle') || format || quelle;
  const karten = [];
  const offen = new Map(); // group id -> card
  for (const o of liste) {
    const g = o.serie ? gruppeVon(k, o.serie) : null;
    if (!g) { karten.push({ o }); continue; }
    const da = offen.get(g.id);
    if (da) { da.hier++; continue; }
    const karte = { gruppe: g, o, hier: 1 };
    offen.set(g.id, karte);
    karten.push(karte);
  }
  return karten.map((c) => {
    if (!c.gruppe) return c;
    const n = zeilenfilter ? c.hier : c.gruppe.anzahl;
    return n > 1 ? { gruppe: c.gruppe, n, o: c.o } : { o: c.o };
  });
}

/* ---------------- Detail sheet ---------------- */

const shards = new Map();
/** The full entry. Its index part is loaded as well, so the sheet can list similar entries. */
export async function ladeKarte(id) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(id)));
  const s = hash[0].toString(16).padStart(2, '0');
  if (!shards.has(s)) shards.set(s, holeJson(`/data/karten/${s}.json`));
  let it;
  try {
    it = (await shards.get(s))[id] ?? null;
  } catch (err) {
    shards.delete(s);
    throw err;
  }
  const a = it && aktuell?.arten.get(it.kind);
  const t = a?.teile[it.indexTeil];
  if (t) await ladeTeil(aktuell, a, t).catch(() => {});
  return it;
}

/** Similar entries: same kind and subcategory, ranked by shared tags (among the loaded rows of the kind). */
export function aehnliche(k, o, n = 8) {
  const tags = new Set(o.tags.split(' ').filter(Boolean));
  return (k.proArt.get(o.art) ?? [])
    .filter((x) => x.id !== o.id && x.unter === o.unter)
    .map((x) => ({ x, p: x.tags.split(' ').filter((t) => tags.has(t)).length + (x.vorschau ? 0.5 : 0) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, n)
    .map((e) => e.x);
}

/** More from the same collection, or by the same creator at the same source (among the loaded rows of the kind). */
export function mehrAusSammlung(k, o, n = 8) {
  const gleich = o.sammlung ? (x) => x.sammlung === o.sammlung : (x) => x.urheber === o.urheber && x.quelle === o.quelle && o.urheber !== 'unbekannt';
  return (k.proArt.get(o.art) ?? []).filter((x) => x.id !== o.id && gleich(x)).slice(0, n);
}
