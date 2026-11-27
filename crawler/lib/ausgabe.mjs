// Output files of publish, as a map path -> content, so tests and measurements can build them without disk.
//
//   index/<art>/kopf.json    the KOPF best rows of the kind (order "empfohlen": rang, then mixed): the folder shows
//                            them first, so a folder shows its best entries before the rest has loaded
//   index/<art>/kopf2.json   only for kinds with more than GROSS rows: the next best rows after the head (up to
//                            KOPF2 in all). The site scrolls through these instead of loading every part of the
//                            kind (Projekte: 634 parts, 94 MB); the rest is reached through subfolders and search.
//   index/<art>/<nn>.json    all rows of the kind in parts of at most TEIL rows, ordered by subfolder, group,
//                            tags, mix. Neighbouring rows are alike, so a search, a subfolder or a group needs few parts.
//   suche/k_<key>.json       search tiles (suchindex.mjs), refs point to rows in the parts
//   index/<art>/gruppen.json the groups of the kind (crawler/lib/gruppen.mjs): name, size, members per subfolder,
//                            the parts that hold the members and up to four pictures for the folder card
//   index/gruppenbloecke.json [first row number, rows, group id] for every run of a group in index order (members
//                            of a group sit together per subfolder), so a search can fold hits without their rows
//   stand.json  .index       which parts and tiles exist, fields of the rows, licence groups, groups per kind
// Why parts of 500 sorted by subfolder and not by hash: measured on the real catalogue scaled to 107,000 rows,
// a typical search needs 12 % of all rows (median) this way and 25 % with hashed parts; larger parts need more.
// (Measured before the group came into the order; not measured again since.)

import { baueKacheln, kachelDatei } from './suchindex.mjs';

export const TEIL = 500;
export const KOPF = 240;
export const GROSS = 20000;
export const KOPF2 = 2400;

const mischwert = (it) => it.sig.slice(-5);
// members of a group sit next to each other within their subfolder, so opening a group needs few parts
const ordnung = (it) => `${it.unter}\u0000${it.serie?.id ?? ''}\u0000${it.tags.slice(0, 8).join(' ')}\u0000${mischwert(it)}`;
const vergleich = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/**
 * Recommended order: higher rang first, then the popularity count itself, then the mixed order. rang comes from
 * crawler/lib/bewertung.mjs (missing = 0); it caps at the 99th percentile and rounds, so without the count the
 * 3,000 most starred projects would tie and come mixed. src/katalog.js sorts the same way.
 */
export const empfohlen = (a, b) => (b.rang ?? 0) - (a.rang ?? 0) || (b.popularity?.value ?? 0) - (a.popularity?.value ?? 0) || vergleich(mischwert(a), mischwert(b)) || vergleich(a.id, b.id);
export const BILDER_JE_GRUPPE = 4;
const eigenesBild = (it) => (it.vorschau?.pfad ? { v: it.vorschau.pfad, b: it.vorschau.b, h: it.vorschau.h } : null);

/**
 * The file index/<art>/gruppen.json: { <group id>: { name, anzahl, unter: { <subfolder>: members }, teile: [part
 * numbers], bilder: [{ v, b, h } own preview | { f } picture at the source], urheber, lizenz } }. urheber and lizenz
 * are '' when the members differ. bild(it) picks the picture of a member (own preview first, the best members first).
 */
function gruppenDatei(mitglieder, teilVon, bild) {
  const out = {};
  for (const [id, l] of mitglieder) {
    const unter = {};
    for (const it of l) unter[it.unter] = (unter[it.unter] ?? 0) + 1;
    const besten = [...l].sort(empfohlen);
    const eigene = besten.map(eigenesBild).filter(Boolean);
    const bilder = (eigene.length ? eigene : besten.map(bild).filter(Boolean)).slice(0, BILDER_JE_GRUPPE);
    const einer = (f) => { const s = new Set(l.map(f)); return s.size === 1 ? [...s][0] ?? '' : ''; };
    out[id] = {
      name: l[0].serie.name,
      anzahl: l.length,
      unter,
      teile: [...new Set(l.map((it) => teilVon.get(it.id)))].sort((a, b) => a - b),
      bilder,
      urheber: einer((it) => it.creator?.name),
      lizenz: einer((it) => it.license.name),
    };
  }
  return out;
}

/**
 * items: published entries in mixed order, each with kind, unter, sig, tags, and rang when ranked; members of a group
 * carry serie = { id, name, anzahl } (crawler/lib/gruppen.mjs). zeile(it) gives the compact row for the fields in
 * felder; suchfelder(it) gives [[text, klasse], ...] for the search index; bild(it) the picture of a group member
 * without own preview ({ f: url } or null).
 * Returns { dateien: Map path -> JSON-able, index: the block for stand.json, teilVon: Map id -> part number }.
 */
export function baueAusgabe(items, { arten, felder, zeile, suchfelder, lizenzgruppe, teil = TEIL, kopf = KOPF, gross = GROSS, kopf2 = KOPF2, budget, bild = () => null }) {
  const dateien = new Map();
  const teilVon = new Map();
  const proArt = new Map(arten.map((a) => [a, []]));
  for (const it of items) proArt.get(it.kind)?.push(it);
  const index = { version: 2, teil, kopf, felder, arten: [], lizenzgruppen: {}, kacheln: [], gruppen: {} };
  const eintraege = [];
  const bloecke = []; // [first row number, rows, group id] for each run of one group in index order
  let ref = 0;
  for (const [art, liste] of proArt) {
    if (!liste.length) continue;
    const beste = [...liste].sort(empfohlen);
    dateien.set(`index/${art}/kopf.json`, { felder, zeilen: beste.slice(0, kopf).map(zeile) });
    const zweiter = liste.length > gross ? beste.slice(kopf, kopf2) : [];
    if (zweiter.length) dateien.set(`index/${art}/kopf2.json`, { felder, zeilen: zweiter.map(zeile) });
    const sortiert = liste.map((it) => [ordnung(it), it]).sort((a, b) => vergleich(a[0], b[0])).map((e) => e[1]);
    const unter = [...new Set(sortiert.map((it) => it.unter))];
    const nr = new Map(unter.map((u, i) => [u, i]));
    const teile = [];
    for (let i = 0; i < sortiert.length; i += teil) {
      const stueck = sortiert.slice(i, i + teil);
      const n = teile.length;
      dateien.set(`index/${art}/${String(n).padStart(2, '0')}.json`, { felder, zeilen: stueck.map(zeile) });
      for (const it of stueck) {
        teilVon.set(it.id, n);
        const b = bloecke.at(-1);
        if (it.serie && b && b[2] === it.serie.id && b[0] + b[1] === ref) b[1]++;
        else if (it.serie) bloecke.push([ref, 1, it.serie.id]);
        eintraege.push([ref++, suchfelder(it)]);
      }
      // [rows, first subfolder, last subfolder] as positions in the list unter
      teile.push([stueck.length, nr.get(stueck[0].unter), nr.get(stueck[stueck.length - 1].unter)]);
    }
    index.arten.push({ art, anzahl: liste.length, kopf: Math.min(kopf, liste.length), ...(zweiter.length ? { kopf2: zweiter.length } : {}), unter, teile });
    const mitglieder = new Map();
    for (const it of sortiert) {
      if (!it.serie) continue;
      if (!mitglieder.has(it.serie.id)) mitglieder.set(it.serie.id, []);
      mitglieder.get(it.serie.id).push(it);
    }
    if (mitglieder.size) {
      dateien.set(`index/${art}/gruppen.json`, gruppenDatei(mitglieder, teilVon, bild));
      index.gruppen[art] = mitglieder.size;
    }
  }
  // the MCP search folds the hits of a group with this, without loading the parts that hold them
  if (bloecke.length) dateien.set('index/gruppenbloecke.json', bloecke);
  for (const it of items) index.lizenzgruppen[it.license.name] ??= lizenzgruppe(it.license);
  const kacheln = baueKacheln(eintraege, budget);
  for (const [s, k] of kacheln) dateien.set(`suche/${kachelDatei(s)}`, k);
  index.kacheln = [...kacheln.keys()];
  return { dateien, index, teilVon };
}
