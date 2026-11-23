export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Only http(s) URLs reach an href or src; anything else becomes "#". */
export const safeUrl = (u) => {
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : '#';
  } catch {
    return '#';
  }
};

export const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch {}
  },
};

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const datum = (iso) => (iso ? dateFmt.format(new Date(iso)) : 'noch nie');

const numFmt = new Intl.NumberFormat('de-DE');
export const zahl = (n) => numFmt.format(n);

export function bytes(n) {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0).replace('.', ',')} ${u[i]}`;
}

export function host(u) {
  try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; }
}

/* ---------------- Ratings ---------------- */
// Only real ratings (an average on a scale, with votes) become stars, scaled to 5 with two decimals.
// Counts without a scale (GitHub stars, downloads, favourites) are popularity and are shown as a number.
const sternFmt = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kurzFmt = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });

/** Five stars filled up to the value; the title names the source and the votes (shown on hover). */
export function sterneHtml(b, { gross = false } = {}) {
  if (!b || !(b.sterne > 0)) return '';
  const wert = Math.min(5, Math.max(0, b.sterne));
  const stimmen = b.anzahl ? `${numFmt.format(b.anzahl)} ${b.anzahl === 1 ? 'Bewertung' : 'Bewertungen'}` : '';
  const text = `${sternFmt.format(wert)} von 5 Sternen${stimmen ? `, ${stimmen}` : ''}${b.quelle ? ` auf ${b.quelle}` : ''}`;
  return `<span class="sterne${gross ? ' sterne--gross' : ''}" title="${esc(text)}"><span class="sterne__balken" role="img" aria-label="${esc(text)}" style="--fuell:${(wert / 5 * 100).toFixed(1)}%"></span><span class="sterne__zahl">${sternFmt.format(wert)}</span></span>`;
}

/** "12,3 Tsd. GitHub-Sterne"; the title names the source. */
export function beliebtheitHtml(p) {
  if (!p || !(p.wert > 0)) return '';
  // a skill has no stars of its own: they belong to the collection it lives in
  const text = `${numFmt.format(p.wert)} ${p.label ?? ''}${p.sammlung ? ' der Sammlung' : ''}${p.quelle ? ` auf ${p.quelle}` : ''}`.trim();
  return `<span class="beliebt" title="${esc(text)}">${esc(kurzFmt.format(p.wert))} ${esc(p.label ?? '')}</span>`;
}

/** Full entry (rating/popularity as stored by the crawler) to the shape the row uses. */
export function bewertungAusEintrag(it) {
  const r = it?.rating;
  const bewertung = r && r.count > 0 && r.max > 0 ? { sterne: Math.round((5 * r.value / r.max) * 100) / 100, anzahl: r.count, quelle: r.source?.name } : null;
  const p = it?.popularity;
  const beliebtheit = p && p.value > 0 ? { wert: p.value, label: p.label, quelle: p.source?.name } : null;
  return { bewertung, beliebtheit };
}
