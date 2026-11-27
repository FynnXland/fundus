// Ratings and popularity as the sources publish them, and the recommended order built from them.
//
// Two different things, never mixed up:
//   rating      an average on a scale with a number of votes (Internet Archive: 1 to 5 stars, 8 votes). Shown as
//               stars out of five. Only what the source itself shows; the catalogue has no ratings of its own.
//   popularity  a count without a scale (GitHub stars, downloads). Shown as the number with its label, never
//               turned into stars.
//
// rating:     { value, min, max, count, source: { name, url } }   stars out of five = 5 * value / max
// popularity: { value, label, source: { name, url } }              label: one of LABELS
//
// The recommended order ("empfohlen") is one number per entry, `rang`, computed when publishing:
//   rated entries      20000 + Bayesian mean of the stars (0 to 5) scaled to 0..9999
//   popular entries    10000 + log-scaled count, normalised per source and kind, scaled to 0..9999
//   everything else    0, and these keep the mixed order (the last five characters of the call number)
// Rated entries come before popular ones, as the owner asked ("echte Bewertungen zuerst, dann Beliebtheit").

export const LABELS = ['GitHub-Sterne', 'Downloads', 'Favoriten', 'Likes'];

/** Prior weight of the Bayesian mean: a source's average counts like this many votes. See docs/stand/fundus-bewertung.md. */
export const BAYES_GEWICHT = 5;
/** Prior mean when a source has fewer than MIN_FUER_MITTEL rated entries of its own. */
export const BAYES_STANDARD = 3.5;
export const MIN_FUER_MITTEL = 20;
/** A source and kind with fewer popularity counts than this borrows the scale of its whole source, then of everything. */
export const MIN_GRUPPE = 20;

const isHttp = (u) => {
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:';
  } catch {
    return false;
  }
};

/** Stars out of five with two decimals, or null when the rating is unusable (no votes, off the scale). */
export function sterne5(r) {
  if (!r || !(r.count > 0) || !(r.max > 0) || !Number.isFinite(r.value)) return null;
  if (r.value < (r.min ?? 0) || r.value > r.max) return null;
  return Math.round((5 * r.value / r.max) * 100) / 100;
}

/** Builds a rating, or undefined when the source has no usable rating for the entry. */
export function bewertung({ value, min = 0, max, count, name, url }) {
  const r = { value: Number(value), min, max: Number(max), count: Math.floor(Number(count)), source: { name, url } };
  return sterne5(r) === null ? undefined : r;
}

/** Builds a popularity, or undefined for a missing or zero count. */
export function beliebtheit({ value, label, name, url }) {
  const v = Math.floor(Number(value));
  return Number.isFinite(v) && v > 0 && LABELS.includes(label) ? { value: v, label, source: { name, url } } : undefined;
}

/** Problems of the optional fields rating and popularity (empty list = fine or absent). */
export function pruefeBewertung(item) {
  const fehler = [];
  const r = item.rating;
  if (r !== undefined) {
    if (!(r.count > 0) || !Number.isInteger(r.count)) fehler.push('rating.count muss eine ganze Zahl über 0 sein');
    if (!(r.max > 0) || !Number.isFinite(r.value) || r.value > r.max || r.value < (r.min ?? 0)) fehler.push('rating.value liegt nicht auf der Skala');
    if (!r.source?.name || !isHttp(r.source.url)) fehler.push('rating.source fehlt');
  }
  const p = item.popularity;
  if (p !== undefined) {
    if (!(p.value > 0) || !Number.isFinite(p.value)) fehler.push('popularity.value muss über 0 sein');
    if (!LABELS.includes(p.label)) fehler.push(`popularity.label unbekannt: ${p.label}`);
    if (!p.source?.name || !isHttp(p.source.url)) fehler.push('popularity.source fehlt');
  }
  return fehler;
}

const bis = (x, n = 9999) => Math.max(0, Math.min(n, Math.round(x * n)));

/**
 * Computes `rang` for every entry (adds the field, returns the same array).
 * Bayesian mean: (C * m + n * s) / (C + n), s = stars of the entry, n = votes, m = mean stars of the rated
 * entries of the same source, C = BAYES_GEWICHT. One vote of 5.0 stays near the source's mean, a thousand votes
 * of 4.8 stay near 4.8.
 * Popularity: log(1 + v) / log(1 + p99), p99 = the 99th percentile of the counts in the same source and kind,
 * capped at 1, so one huge outlier does not flatten everything else and GitHub stars do not outrank downloads.
 * A group with fewer than MIN_GRUPPE counts has no meaningful top (its only entry would be its own p99 and get the
 * full score): it takes the p99 of its whole source, and if that is small too, of all counts.
 */
/**
 * Skills carry the stars of their collection, so every skill of a collection has the same rank and a whole
 * collection would sit in one block. Interleave instead: the first skill of each collection (collections by
 * stars), then the second of each, and so on. The ranks are renumbered downwards from the highest one, so the
 * head of the folder and the browser's sort both follow this order. Mutates the items.
 */
export function reihumNachSammlung(skills) {
  if (skills.length < 2) return;
  const gruppen = new Map();
  for (const it of skills) {
    const k = it.popularity?.source?.url ?? it.collection?.id ?? it.id;
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(it);
  }
  const reihen = [...gruppen.values()]
    .map((l) => l.sort((a, b) => a.id.localeCompare(b.id)))
    .sort((a, b) => b[0].rang - a[0].rang || a[0].id.localeCompare(b[0].id));
  const oben = skills.reduce((m, it) => Math.max(m, it.rang), -Infinity);
  let i = 0;
  for (let stufe = 0; reihen.some((l) => l.length > stufe); stufe++) {
    for (const l of reihen) if (l[stufe]) l[stufe].rang = Math.max(10000, oben - i++);
  }
}

export function rangwerte(items) {
  const mittel = new Map(); // source -> [sum, n]
  const zaehlungen = new Map(); // source|kind -> counts
  for (const it of items) {
    const s = sterne5(it.rating);
    if (s !== null) {
      const m = mittel.get(it.source.id) ?? [0, 0];
      m[0] += s;
      m[1]++;
      mittel.set(it.source.id, m);
    }
    if (it.popularity?.value > 0) {
      const k = `${it.source.id}|${it.kind}`;
      const l = zaehlungen.get(k) ?? [];
      l.push(it.popularity.value);
      zaehlungen.set(k, l);
    }
  }
  const alleSumme = [...mittel.values()].reduce((a, m) => a + m[0], 0);
  const alleAnzahl = [...mittel.values()].reduce((a, m) => a + m[1], 0);
  const vorMittel = (id) => {
    const m = mittel.get(id);
    if (m && m[1] >= MIN_FUER_MITTEL) return m[0] / m[1];
    return alleAnzahl >= MIN_FUER_MITTEL ? alleSumme / alleAnzahl : BAYES_STANDARD;
  };
  const p99 = (l) => {
    l.sort((a, b) => a - b);
    return l[Math.min(l.length - 1, Math.floor(l.length * 0.99))];
  };
  const nachQuelle = new Map();
  const alle = [];
  for (const [k, l] of zaehlungen) {
    const q = k.split('|')[0];
    // plain loops: push(...l) breaks the call stack once a source has a few hundred thousand entries (GitHub)
    if (!nachQuelle.has(q)) nachQuelle.set(q, []);
    const ziel = nachQuelle.get(q);
    for (const x of l) { ziel.push(x); alle.push(x); }
  }
  const bezug = new Map();
  const pQuelle = new Map();
  let pAlle;
  for (const [k, l] of zaehlungen) {
    const q = k.split('|')[0];
    const quellenListe = nachQuelle.get(q);
    if (l.length >= MIN_GRUPPE) bezug.set(k, p99(l));
    else if (quellenListe.length >= MIN_GRUPPE) {
      if (!pQuelle.has(q)) pQuelle.set(q, p99(quellenListe));
      bezug.set(k, pQuelle.get(q));
    } else bezug.set(k, (pAlle ??= p99(alle)));
  }
  for (const it of items) {
    const s = sterne5(it.rating);
    if (s !== null) {
      const b = (BAYES_GEWICHT * vorMittel(it.source.id) + it.rating.count * s) / (BAYES_GEWICHT + it.rating.count);
      it.rang = 20000 + bis(b / 5);
    } else if (it.popularity?.value > 0) {
      const ref = bezug.get(`${it.source.id}|${it.kind}`);
      it.rang = 10000 + bis(Math.min(1, Math.log1p(it.popularity.value) / Math.log1p(ref)));
    } else {
      it.rang = 0;
    }
  }
  reihumNachSammlung(items.filter((it) => it.kind === 'skill' && it.rang >= 10000 && it.rang < 20000));
  return items;
}
