// Apply the stored theme before first paint so the page does not flash. A file of its own instead of an inline
// script, so the Content-Security-Policy can stay script-src 'self' (public/_headers).
try {
  const t = localStorage.getItem('fundus.thema');
  if (t === 'hell' || t === 'dunkel') document.documentElement.dataset.theme = t === 'hell' ? 'light' : 'dark';
} catch {}
