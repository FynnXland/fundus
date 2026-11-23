// Fontsource: open-licensed fonts (mostly Google Fonts) with files on jsDelivr. The designer comes from the
// METADATA.pb of the google/fonts repository when the font is a Google font; otherwise the entry names the
// publisher. Only OFL and Apache fonts with a Latin subset.
import { getJson, politeFetch, setHostGap } from '../lib/http.mjs';
import { makeItem } from '../lib/item.mjs';
import { normalizeLicense } from '../lib/licenses.mjs';

const API = 'https://api.fontsource.org/v1/fonts';

const source = {
  id: 'fontsource',
  code: 'FS',
  name: 'Fontsource',
  url: 'https://fontsource.org',
  kinds: ['schrift'],
  terms: 'https://github.com/fontsource/fontsource/blob/main/LICENSE',
};

const CATEGORY = { 'sans-serif': 'Grotesk', serif: 'Serif', display: 'Display', handwriting: 'Handschrift', monospace: 'Monospace', icons: 'Symbole', other: 'Sonstige' };

export function parseFont(f, designer) {
  const license = normalizeLicense(f.license);
  if (!license || !f.subsets?.includes('latin')) return null;
  const weight = f.weights?.includes(400) ? 400 : f.weights?.[0] ?? 400;
  const style = f.styles?.includes('normal') ? 'normal' : f.styles?.[0] ?? 'normal';
  const woff2 = `https://cdn.jsdelivr.net/fontsource/fonts/${f.id}@latest/latin-${weight}-${style}.woff2`;
  return makeItem(source, {
    sourceId: f.id,
    kind: 'schrift',
    title: f.family,
    tags: [CATEGORY[f.category] ?? f.category, f.variable ? 'variable' : null, ...(f.subsets ?? []).slice(0, 4)].filter(Boolean),
    creator: designer ? { name: designer } : { name: f.type === 'google' ? 'Google Fonts (Herausgeber)' : 'siehe Ursprungsseite' },
    landing: `https://fontsource.org/fonts/${f.id}`,
    license,
    preview: { type: 'font', url: woff2 },
    downloads: [
      { label: 'Alle Schnitte (ZIP)', url: `https://r2.fontsource.org/fonts/${f.id}@latest/download.zip`, format: 'zip' },
      { label: `WOFF2 ${weight}`, url: woff2, format: 'woff2' },
    ],
    meta: { schnitte: `${f.weights?.length ?? 1} Stärken${f.styles?.includes('italic') ? ', kursiv' : ''}`, kategorie: CATEGORY[f.category] ?? f.category },
  });
}

async function googleDesigner(f) {
  if (f.type !== 'google') return null;
  const dir = { 'OFL-1.1': 'ofl', 'Apache-2.0': 'apache' }[f.license];
  if (!dir) return null;
  const res = await politeFetch(`https://raw.githubusercontent.com/google/fonts/main/${dir}/${f.id.replace(/-/g, '')}/METADATA.pb`, { retries: 1 });
  if (!res.ok) return null;
  return (await res.text()).match(/^designer:\s*"([^"]+)"/m)?.[1] ?? null;
}

source.crawl = async function crawl(cfg, log) {
  setHostGap('api.fontsource.org', 1000);
  setHostGap('raw.githubusercontent.com', 150);
  let list;
  try {
    list = await getJson(`${API}?subsets=latin`);
  } catch (err) {
    log(`  fontsource: ${err.message}`);
    return [];
  }
  const chosen = list
    .filter((f) => ['OFL-1.1', 'Apache-2.0'].includes(f.license) && f.category !== 'icons')
    .sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''))
    .slice(0, cfg.limit ?? 200);
  const out = [];
  setHostGap('cdn.jsdelivr.net', 100);
  for (const f of chosen) {
    const it = parseFont(f, await googleDesigner(f).catch(() => null));
    if (!it) continue;
    // Some families have no file under the expected Latin name; those would only show a broken sample.
    const head = await politeFetch(it.preview.url, { method: 'HEAD', retries: 1 }).catch(() => null);
    if (head?.ok) out.push(it);
    else log(`  fontsource ${f.id}: keine Latin-Datei, übersprungen`);
  }
  return out;
};

export default source;
