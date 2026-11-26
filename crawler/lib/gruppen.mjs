// Groups of entries that belong together, shown on the site as one folder card and in fundus_search as one line.
// Which keys hold was measured on the real catalogue (docs/stand/fundus-gruppen.md, crawler/gruppen-messen.mjs):
//
//   sammlung  the collection of the entry plus its creator: an emoji set, a Streamline series, a skill repository,
//             game-icons.net split by designer
//   reihe     the title without its counter ("Brass Vase 01", "Book of Hours: fol. 12r", "(3 of 6)") within source,
//             kind and creator. Poly Haven and ambientCG number their own series across authors, so there the
//             creator is left out. Without a known creator only real counters group; at Wellcome only explicit
//             ones (a bare number there is mostly a shelf mark).
//
// Not used, because the sample was not clean: identical titles without a counter, Commons categories, the creator
// alone, Internet Archive collections. A group needs MINDEST members; smaller ones stay single entries.
import { createHash } from 'node:crypto';

export const MINDEST = 3;
// sources whose titles are numbered by the source itself, not by the author
const QUELLREIHE = new Set(['polyhaven', 'ambientcg']);

const kennt = (n) => Boolean(n) && !/^(unbekannt|unknown|anonym|anonymous|see above|various)/i.test(n.trim());
// a counter: 01, 12r, 5b; not a year (a title "Paris 1889" is not part of a series "Paris")
const ZAEHLER = /^(?:\d{1,3}[a-z]?|\d{4}[a-z]?)$/i;
const istZaehler = (t) => ZAEHLER.test(t) && !/^(1[5-9]|20)\d\d$/.test(t);
// file counters of cameras and recorders: DSC 0987 is two tokens (DSC, 0987), DSCF2224, IMG3548, XC250491 one
const DATEIZAEHLER = /^[a-z]{2,4}\d{3,}$/i;

// words that announce a counter: "folio 2b", "Plate 12", "No. 3", "Pose 11"
const ZAEHLWORT = /(?:^|[\s,(:;])(?:folio|fol|leaf|plate|page|pose|no|nr|part|teil|vol|volume|tafel|blatt|band|episode|movement)\.?$/i;
// At these sources a bare number after a word is mostly a shelf mark ("Hindi Manuscript 884", "WMS Turkish 19"):
// only an explicit counter groups there (measured on the live crawl, docs/stand/fundus-gruppen.md).
const NUR_AUSDRUECKLICH = new Set(['wellcome']);

/**
 * The title without a trailing counter. Returns { s: key (lower case, single spaces), zaehler: true when a counter
 * was removed, ausdruecklich: true when it was one beyond doubt (in brackets, after a comma, # or a counter word) }
 * or null when nothing usable is left.
 */
export function stamm(titel) {
  let s = String(titel ?? '').normalize('NFC').toLowerCase().replace(/_/g, ' ').replace(/\.(wav|aiff?|mp3|ogg|flac|png|jpe?g|svg|glb|blend)$/, '').replace(/\s+/g, ' ').trim();
  let zaehler = false;
  let ausdruecklich = false;
  const klammer = s.match(/^(.*?)[\s,.\-]*\(\s*(\d{1,4}[a-z]?|\d{1,3} of \d{1,3})\s*\)$/);
  if (klammer && !/^(1[5-9]|20)\d\d$/.test(klammer[2])) {
    s = klammer[1];
    zaehler = ausdruecklich = true;
  } else {
    // "no. 2", "nr 2", "#2", "part 2", "vol. 2", "fol. 12r" keep their word ("Circus, No."), the name is cut later
    const m = s.match(/^(.*?)([\s,#:\-]*)([^\s#]+)$/);
    if (m && m[1] && (istZaehler(m[3]) || DATEIZAEHLER.test(m[3]))) {
      s = m[1];
      zaehler = true;
      ausdruecklich = istZaehler(m[3]) && (/[,#]/.test(m[2]) || ZAEHLWORT.test(m[1]));
    }
  }
  s = s.replace(/[\s,.:;\-–]+$/, '');
  return s.length >= 3 && /\p{L}/u.test(s) ? { s, zaehler, ausdruecklich } : null;
}

/** The group key of an entry, or null. */
export function schluessel(it) {
  if (it.collection?.id) return `sammlung|${it.source.id}|${it.kind}|${it.collection.id}|${it.creator?.name ?? ''}`;
  const st = stamm(it.title);
  if (!st?.zaehler) return null;
  if (NUR_AUSDRUECKLICH.has(it.source.id) && !st.ausdruecklich) return null;
  const wer = QUELLREIHE.has(it.source.id) ? '' : kennt(it.creator?.name) ? it.creator.name : '';
  return `reihe|${it.source.id}|${it.kind}|${wer}|${st.s}`;
}

/** Natural order of titles: "Vase 2" before "Vase 10". */
export const titelOrdnung = (a, b) => a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' });

/** Longest common start of the titles, cut back to a word end, without trailing separators and counter words. */
export function gemeinsamerName(titel) {
  let p = titel[0] ?? '';
  for (const t of titel) {
    let i = 0;
    while (i < p.length && i < t.length && p[i].toLowerCase() === t[i].toLowerCase()) i++;
    p = p.slice(0, i);
  }
  // only whole words: cut back to the last separator unless every title ends right here
  if (!titel.every((t) => t.length === p.length || /[\s_,.:;()\-]/.test(t[p.length]))) p = p.replace(/[^\s_,.:;()\-]*$/, '');
  for (let i = 0; i < 3; i++) p = p.replace(/[\s_,.:;(\-–#]+$/, '').replace(/[\s_,(](no|nr|fol|folio|part|teil|vol|leaf|plate|tafel|blatt)\.?$/i, '');
  return p.replace(/_/g, ' ').trim();
}

const gid = (art, key, n = 8) => `${art}.${createHash('sha1').update(key).digest('hex').slice(0, n)}`;

/**
 * Forms the groups. items: published entries (after dedupe), each with kind, source, creator, title, collection.
 * Sets it.serie = { id, name, anzahl } on every member of a group with at least MINDEST members (and removes an
 * old one from everything else). Ids look like "3d.4f2a9c1e": kind, dot, the start of sha1(key).
 * Returns Map id -> { id, art, name, schluessel, quelle, urheber, mitglieder: [items] }.
 */
export function bildeGruppen(items, { mindest = MINDEST } = {}) {
  const nachSchluessel = new Map();
  for (const it of items) {
    delete it.serie;
    const k = schluessel(it);
    if (!k) continue;
    if (!nachSchluessel.has(k)) nachSchluessel.set(k, []);
    nachSchluessel.get(k).push(it);
  }
  // a collection split by creator says so in its name only when it has more than one creator group
  const teileJeSammlung = new Map();
  for (const [k, l] of nachSchluessel) {
    if (!k.startsWith('sammlung|') || l.length < mindest) continue;
    const s = k.split('|').slice(0, 4).join('|');
    teileJeSammlung.set(s, (teileJeSammlung.get(s) ?? 0) + 1);
  }
  const gruppen = new Map();
  for (const [k, l] of nachSchluessel) {
    if (l.length < mindest) continue;
    const art = l[0].kind;
    let id = gid(art, k);
    for (let n = 10; gruppen.has(id); n += 2) id = gid(art, k, n);
    const titel = l.map((it) => it.title).sort(titelOrdnung);
    let name;
    if (k.startsWith('sammlung|')) {
      const c = l[0].collection.name;
      name = teileJeSammlung.get(k.split('|').slice(0, 4).join('|')) > 1 ? `${c}: ${l[0].creator.name}` : c;
    } else {
      name = gemeinsamerName(titel) || titel[0];
    }
    const urheber = new Set(l.map((it) => it.creator?.name ?? ''));
    gruppen.set(id, { id, art, name, schluessel: k, quelle: l[0].source.id, urheber: urheber.size === 1 ? [...urheber][0] : '', mitglieder: l });
    for (const it of l) it.serie = { id, name, anzahl: l.length };
  }
  return gruppen;
}
