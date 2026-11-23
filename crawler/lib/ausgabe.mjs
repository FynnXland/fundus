// Output files of publish, as a map path -> content, so tests and measurements can build them without disk.
//
//   index/<art>/kopf.json    the first KOPF rows of the kind in mixed order: the folder shows them first
//   index/<art>/<nn>.json    all rows of the kind in parts of at most TEIL rows, ordered by subfolder, tags,
//                            mix. Neighbouring rows are alike, so a search or a subfolder needs few parts.
//   suche/k_<key>.json       search tiles (suchindex.mjs), refs point to rows in the parts
//   stand.json  .index       which parts and tiles exist, fields of the rows, licence groups
// Why parts of 500 sorted by subfolder and not by hash: measured on the real catalogue scaled to 107,000 rows,
// a typical search needs 12 % of all rows (median) this way and 25 % with hashed parts; larger parts need more.

import { baueKacheln, kachelDatei } from './suchindex.mjs';

export const TEIL = 500;
export const KOPF = 240;

const mischwert = (it) => it.sig.slice(-5);
const ordnung = (it) => `${it.unter}\u0000${it.tags.slice(0, 8).join(' ')}\u0000${mischwert(it)}`;
const vergleich = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * items: published entries in mixed order, each with kind, unter, sig, tags. zeile(it) gives the compact row for
 * the fields in felder; suchfelder(it) gives [[text, klasse], ...] for the search index.
 * Returns { dateien: Map path -> JSON-able, index: the block for stand.json, teilVon: Map id -> part number }.
 */
export function baueAusgabe(items, { arten, felder, zeile, suchfelder, lizenzgruppe, teil = TEIL, kopf = KOPF, budget }) {
  const dateien = new Map();
  const teilVon = new Map();
  const proArt = new Map(arten.map((a) => [a, []]));
  for (const it of items) proArt.get(it.kind)?.push(it);
  const index = { version: 2, teil, kopf, felder, arten: [], lizenzgruppen: {}, kacheln: [] };
  const eintraege = [];
  let ref = 0;
  for (const [art, liste] of proArt) {
    if (!liste.length) continue;
    dateien.set(`index/${art}/kopf.json`, { felder, zeilen: liste.slice(0, kopf).map(zeile) });
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
        eintraege.push([ref++, suchfelder(it)]);
      }
      // [rows, first subfolder, last subfolder] as positions in the list unter
      teile.push([stueck.length, nr.get(stueck[0].unter), nr.get(stueck[stueck.length - 1].unter)]);
    }
    index.arten.push({ art, anzahl: liste.length, kopf: Math.min(kopf, liste.length), unter, teile });
  }
  for (const it of items) index.lizenzgruppen[it.license.name] ??= lizenzgruppe(it.license);
  const kacheln = baueKacheln(eintraege, budget);
  for (const [s, k] of kacheln) dateien.set(`suche/${kachelDatei(s)}`, k);
  index.kacheln = [...kacheln.keys()];
  return { dateien, index, teilVon };
}
