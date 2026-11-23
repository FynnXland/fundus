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
