// Search index in prefix tiles, shared by publish (Node) and the website (browser): no node: imports.
//
// Every row of the index has a global number (ref): kinds in the order of stand.json, parts in order, rows in
// order. A tile maps terms to the refs that contain them, in three weight classes:
//   0 = title (weight 3), 1 = tags and subfolder (2), 2 = creator, source name, formats (1)
// A term lives in the tile with the longest key that is a prefix of the term. Tiles are split by size, so a
// common start like "st" gets tiles of its own while rare letters share one.
// Ref lists are compact: the first number is a ref, a positive number is the gap to the next ref, a negative
// number -k means k more refs directly after the last one (rows of one subfolder sit next to each other).

export const GEWICHTE = [3, 2, 1];

/** Lowercase, accents and umlauts folded (ä → a, ß → ss), so "Gemälde" and "gemalde" meet. */
export function normalisiere(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss');
}

/** Words of a text as search terms. */
export function woerter(s) {
  return normalisiere(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w) => w.slice(0, 32));
}

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
        if (!e) terme.set(w, (e = { l: [[], [], []], ref: -1 }));
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
    kodiert.set(w, { l, groesse: w.length + 4 + JSON.stringify(l).length });
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
      if (rest > budget) { teile(praefix + c, g.w); rest -= g.g; } else bleibt.push(...g.w);
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
 * Hits for a query over loaded tiles. kacheln: Map key -> tile. All words must match (AND); a word matches
 * exactly, as the start of a term (words of two letters or more) or with a typo (one per five letters, from
 * five letters on, only among terms of the same tile region). Returns Map ref -> score.
 */
export function suche(anfrage, kacheln, schluessel) {
  const ws = [...new Set(woerter(anfrage))];
  if (!ws.length) return new Map();
  let ergebnis = null;
  for (const w of ws) {
    const punkte = new Map();
    const max = w.length >= 5 ? Math.min(2, Math.round(w.length * 0.2)) : 0;
    for (const s of kachelnFuer(w, schluessel)) {
      const k = kacheln.get(s);
      if (!k) continue;
      for (const term in k) {
        let faktor = 0;
        if (term === w) faktor = 1;
        else if (w.length > 1 && term.startsWith(w)) faktor = 0.5;
        else if (max && abstand(term, w, max) <= max) faktor = 0.4;
        if (!faktor) continue;
        k[term].forEach((liste, klasse) => {
          if (!liste) return;
          const p = GEWICHTE[klasse] * faktor;
          for (const r of dekodiere(liste)) if ((punkte.get(r) ?? 0) < p) punkte.set(r, p);
        });
      }
    }
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
