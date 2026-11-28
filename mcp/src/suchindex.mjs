// Search index in prefix tiles, shared by publish (Node) and the website (browser): no node: imports.
//
// Every row of the index has a global number (ref): kinds in the order of stand.json, parts in order, rows in
// order. A tile maps terms to the refs that contain them, in four weight classes:
//   0 = title (weight 3), 1 = tags and subfolder (2), 2 = creator, source name, formats, kind names (1),
//   3 = words of the description (0.5, filtered by beschreibungsWoerter)
// A row is listed once per term, in its best class. A term lives in the tile with the longest key that is a
// prefix of the term. Tiles are split by size in UTF-8 bytes, so a common start like "st" gets tiles of its own
// while rare letters share one.
// Ref lists are compact: the first number is a ref, a positive number is the gap to the next ref, a negative
// number -k means k more refs directly after the last one (rows of one subfolder sit next to each other).
//
// suche() is the AND search (every word must match). The pieces below it (kartenFuer, undVerknuepft,
// teilTreffer) let a caller fall back to entries matching most words when AND finds (almost) nothing.

import { alternativen } from './synonyme.mjs';

export const GEWICHTE = [3, 2, 1, 0.5];

/** Lowercase, accents and umlauts folded (ä → a, ß → ss), so "Gemälde" and "gemalde" meet. */
export function normalisiere(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss');
}

/** Words of a text as search terms. */
export function woerter(s) {
  return normalisiere(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w) => w.slice(0, 32));
}

// Words that say nothing about an asset; only dropped from descriptions (titles and tags keep every word).
const LEER = new Set(`a an and are as at be been but by can do does for from has have how if in into is it its
of on or so such that the their then there these this those to use used uses using via was what when which while
who will with without you your yours also any all more most other than only very just about after before over
under each both own same some new etc eg ie based allows provides lets helps make makes made get gets like
der die das den dem des ein eine einen einem einer und oder aber mit fur von zu zum zur im in ist sind wird
werden bei auf aus als auch nicht nur noch wie was wenn dass sich es sie er wir ihr ihre sein seine diese dieser
dieses man kann konnen uber unter nach vor`.split(/\s+/));

/**
 * The words of a description worth indexing, as one string: Latin script only (other scripts would become one
 * long junk term), 2 to 24 letters, no plain numbers, no filler words, each word once, at most 60.
 */
export function beschreibungsWoerter(s) {
  const out = new Set();
  for (const w of woerter(s)) {
    if (out.size >= 60) break;
    if (w.length < 2 || w.length > 24 || /^\d+$/.test(w) || LEER.has(w) || !/^[a-z0-9]+$/.test(w)) continue;
    out.add(w);
  }
  return [...out].join(' ');
}

/** English singular of a query word ("chairs" → "chair", "berries" → "berry", "boxes" → "box"), else the word. */
export function einzahl(w) {
  if (w.length < 4 || !w.endsWith('s') || /(ss|us|is)$/.test(w)) return w;
  if (/ies$/.test(w) && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(sses|xes|zes|ches|shes)$/.test(w)) return w.slice(0, -2);
  return w.slice(0, -1);
}

const utf8 = (s) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3;
  }
  return n;
};

export function kodiere(refs) {
  const out = [];
  let letzte = -1;
  for (const r of refs) {
    if (letzte >= 0 && r === letzte + 1 && out.length && out[out.length - 1] < 0) out[out.length - 1]--;
    else if (letzte >= 0 && r === letzte + 1) out.push(-1);
    else out.push(letzte < 0 ? r : r - letzte);
    letzte = r;
  }
  return out;
}

export function dekodiere(liste, ziel = []) {
  let letzte = -1;
  for (const z of liste) {
    if (z < 0) for (let i = 0; i < -z; i++) ziel.push(++letzte);
    else ziel.push((letzte = letzte < 0 ? z : letzte + z));
  }
  return ziel;
}

/** File name of a tile. Windows reserves names like "con", hence the prefix; other characters as hex. */
export function kachelDatei(schluessel) {
  return `k_${[...schluessel].map((c) => (/[a-z0-9]/.test(c) ? c : `_${c.codePointAt(0).toString(16)}-`)).join('')}.json`;
}

/**
 * Builds the tiles. eintraege: iterable of [ref, [[text, klasse], ...]] in ascending ref order.
 * Returns Map key -> { term: [liste0, liste1?, liste2?] } (an empty class is 0).
 */
export function baueKacheln(eintraege, budget = 64 * 1024) {
  const terme = new Map();
  for (const [ref, felder] of eintraege) {
    for (const [text, klasse] of felder) {
      for (const w of woerter(text)) {
        let e = terme.get(w);
        if (!e) terme.set(w, (e = { l: GEWICHTE.map(() => []), ref: -1 }));
        if (e.ref === ref) continue; // the better class of this row already has the term
        e.ref = ref;
        e.l[klasse].push(ref);
      }
    }
  }
  const kodiert = new Map();
  for (const [w, e] of terme) {
    const l = e.l.map((x) => (x.length ? kodiere(x) : 0));
    while (l.length > 1 && l[l.length - 1] === 0) l.pop();
    // "term":[...], in bytes: the budget is the file size
    kodiert.set(w, { l, groesse: utf8(JSON.stringify(w)) + 2 + JSON.stringify(l).length });
  }
  const kacheln = new Map();
  const teile = (praefix, liste) => {
    const summe = liste.reduce((a, w) => a + kodiert.get(w).groesse, 0);
    if (summe <= budget || praefix.length >= 8) return ausgeben(praefix, liste);
    const gruppen = new Map();
    const eigene = [];
    for (const w of liste) {
      if (w.length === praefix.length) { eigene.push(w); continue; }
      const c = [...w.slice(praefix.length)][0];
      if (!gruppen.has(c)) gruppen.set(c, { w: [], g: 0 });
      const g = gruppen.get(c);
      g.w.push(w);
      g.g += kodiert.get(w).groesse;
    }
    // split off the biggest groups until the rest fits
    let rest = summe;
    const bleibt = [...eigene];
    for (const [c, g] of [...gruppen].sort((a, b) => b[1].g - a[1].g)) {
      if (rest > budget) { teile(praefix + c, g.w); rest -= g.g; } else for (const w of g.w) bleibt.push(w);
    }
    ausgeben(praefix, bleibt);
  };
  const ausgeben = (praefix, liste) => {
    if (!liste.length) return;
    const k = {};
    for (const w of liste.sort()) k[w] = kodiert.get(w).l;
    kacheln.set(praefix, k);
  };
  teile('', [...kodiert.keys()]);
  return kacheln;
}

/** Tiles that can hold terms starting with wort: the longest key that is a prefix of it, and all keys below it. */
export function kachelnFuer(wort, schluessel) {
  let vorfahr = null;
  const out = [];
  for (const s of schluessel) {
    if (wort.startsWith(s)) { if (vorfahr === null || s.length > vorfahr.length) vorfahr = s; }
    else if (s.startsWith(wort)) out.push(s);
  }
  if (vorfahr !== null) out.push(vorfahr);
  return out;
}

function abstand(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let vorher = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const jetzt = [i];
    let min = i;
    for (let j = 1; j <= b.length; j++) {
      jetzt[j] = Math.min(vorher[j] + 1, jetzt[j - 1] + 1, vorher[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (jetzt[j] < min) min = jetzt[j];
    }
    if (min > max) return max + 1;
    vorher = jetzt;
  }
  return vorher[b.length];
}

/**
 * Tiles a query word needs: those of kachelnFuer (for a one-letter word only the one that holds it, as it
 * matches exactly) plus the tile of its singular when that lives elsewhere.
 */
export function kachelnFuerWort(w, schluessel) {
  const out = kachelnFuer(w, schluessel).filter((s) => w.length > 1 || w.startsWith(s));
  const e = einzahl(w);
  if (e !== w) for (const s of kachelnFuer(e, schluessel)) if (e.startsWith(s) && !out.includes(s)) out.push(s);
  return out;
}

/** All tiles a query needs, the English equivalents of German words included (synonyme.mjs). */
export const kachelnFuerAnfrage = (anfrage, schluessel) => [...new Set([...new Set(woerter(anfrage))].flatMap((w) => alternativen(w).flat()).flatMap((w) => kachelnFuerWort(w, schluessel)))];

/**
 * Score of every ref for one query word: exact 1, singular or plural of it 0.9 ("chairs"/"chair"), start of a
 * term 0.5 (words of two letters or more), typo 0.4 (one per five letters, from five letters on, only among
 * terms of the same tile region), times the weight of the class. Returns Map ref -> best score.
 */
export function wortPunkte(w, kacheln, schluessel) {
  const punkte = new Map();
  const max = w.length >= 5 ? Math.min(2, Math.round(w.length * 0.2)) : 0;
  const e = einzahl(w);
  const stamm = e.endsWith('y') && e !== w ? e.slice(0, -1) : e; // "berries" shares "berr" with "berry"
  for (const s of kachelnFuerWort(w, schluessel)) {
    const k = kacheln.get(s);
    if (!k) continue;
    for (const term in k) {
      let faktor = 0;
      if (term === w) faktor = 1;
      else if (stamm.length > 2 && term.startsWith(stamm) && term.length <= w.length + 2 && einzahl(term) === e) faktor = 0.9;
      else if (w.length > 1 && term.startsWith(w)) faktor = 0.5;
      else if (max && abstand(term, w, max) <= max) faktor = 0.4;
      if (!faktor) continue;
      const listen = k[term];
      for (let klasse = 0; klasse < listen.length; klasse++) {
        if (!listen[klasse]) continue;
        const p = GEWICHTE[klasse] * faktor;
        for (const r of dekodiere(listen[klasse])) if ((punkte.get(r) ?? 0) < p) punkte.set(r, p);
      }
    }
  }
  return punkte;
}

/**
 * The per-word scores of a query: { ws: distinct words, karten: [Map ref -> score] in the same order }. A German word
 * with English equivalents ("teppich": rug, carpet) scores what any of them finds; a two-word equivalent ("still life")
 * needs both words. The word stays one query word, so "missing" names it as typed.
 */
export function kartenFuer(anfrage, kacheln, schluessel) {
  const ws = [...new Set(woerter(anfrage))].slice(0, 16);
  return { ws, karten: ws.map((w) => wortKarte(w, kacheln, schluessel)) };
}

function wortKarte(w, kacheln, schluessel) {
  const alts = alternativen(w);
  if (alts.length === 1) return wortPunkte(w, kacheln, schluessel);
  const out = new Map();
  for (const alt of alts) {
    const m = alt.length === 1 ? wortPunkte(alt[0], kacheln, schluessel) : new Map([...undVerknuepft(alt.map((x) => wortPunkte(x, kacheln, schluessel)))].map(([r, p]) => [r, p / alt.length]));
    for (const [r, p] of m) if ((out.get(r) ?? 0) < p) out.set(r, p);
  }
  return out;
}

/** Refs found by every word, score = sum of the word scores. */
export function undVerknuepft(karten) {
  if (!karten.length) return new Map();
  const [kleinste, ...rest] = [...karten].sort((a, b) => a.size - b.size);
  const out = new Map();
  for (const [r, p] of kleinste) {
    let summe = p;
    let ok = true;
    for (const m of rest) { const q = m.get(r); if (q === undefined) { ok = false; break; } summe += q; }
    if (ok) out.set(r, summe);
  }
  return out;
}

/**
 * Fallback for few AND hits: refs found by at least mindestens words (default: half of them, rounded up; when
 * fewer than 10 reach that, one word is enough, so a list of names like "press start silkscreen vt323" finds
 * each name) but not by all, best first: more words, then rarer words (a word found in few entries counts more), then class.
 * Within the same words and the same rounded class level, neighbouring refs stay together: a page of fallback
 * rows then lies in a few index parts instead of one part per row (CPU time in the Worker).
 * filter(ref) limits the refs before counting (kind, subfolder). Returns [[ref, mask of found words], ...],
 * at most max entries.
 */
export function teilTreffer(ws, karten, { mindestens, filter = null, max = 100 } = {}) {
  if (mindestens === undefined) {
    const haelfte = Math.ceil(ws.length / 2);
    const out = teilTreffer(ws, karten, { mindestens: haelfte, filter, max });
    return out.length >= 10 || haelfte <= 1 ? out : teilTreffer(ws, karten, { mindestens: 1, filter, max });
  }
  const n = ws.length;
  const alle = (1 << n) - 1;
  const selten = karten.map((m) => Math.log2(1 + 100000 / Math.max(1, m.size)));
  // A ref found by at least mindestens words is in one of the n - mindestens + 1 smallest lists, so only those
  // supply candidates; the big ones (a kind name finds every entry of its kind) are only looked up.
  const nachGroesse = karten.map((m, i) => i).sort((a, b) => karten[a].size - karten[b].size);
  const gesehen = new Set();
  const out = [];
  for (const i of nachGroesse.slice(0, Math.max(1, n - mindestens + 1))) {
    for (const r of karten[i].keys()) {
      if (gesehen.has(r)) continue;
      gesehen.add(r);
      if (filter && !filter(r)) continue;
      let maske = 0;
      let p = 0;
      let wert = 0;
      let zahl = 0;
      for (let j = 0; j < n; j++) {
        const q = karten[j].get(r);
        if (q !== undefined) { maske |= 1 << j; wert += selten[j]; p += q; zahl++; }
      }
      // [ref, mask, words, rarity of the words found, class level (rounded), neighbourhood]
      if (maske !== alle && zahl >= mindestens) out.push([r, maske, zahl, Math.round(wert * 4), Math.round(p), r >> 9]);
    }
  }
  out.sort((a, b) => b[2] - a[2] || b[3] - a[3] || b[4] - a[4] || a[5] - b[5] || streu(a[0]) - streu(b[0]));
  return out.slice(0, max).map(([r, maske]) => [r, maske]);
}

/** Hits for a query over loaded tiles (kacheln: Map key -> tile): every word must match (AND). Map ref -> score. */
export function suche(anfrage, kacheln, schluessel) {
  const ws = [...new Set(woerter(anfrage))];
  if (!ws.length) return new Map();
  let ergebnis = null;
  for (const w of ws) {
    const punkte = wortKarte(w, kacheln, schluessel);
    if (ergebnis === null) ergebnis = punkte;
    else {
      const neu = new Map();
      for (const [r, p] of ergebnis) if (punkte.has(r)) neu.set(r, p + punkte.get(r));
      ergebnis = neu;
    }
    if (!ergebnis.size) break;
  }
  return ergebnis;
}

/** Stable pseudo-random order for equal scores, so results stay mixed instead of grouped by subfolder. */
export const streu = (r) => Math.imul(r ^ 0x9e3779b9, 0x85ebca6b) >>> 0;

export function rangfolge(treffer) {
  return [...treffer].sort((a, b) => b[1] - a[1] || streu(a[0]) - streu(b[0])).map((e) => e[0]);
}
