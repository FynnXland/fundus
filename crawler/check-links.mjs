// Link checker: asks every preview, download and origin URL in the catalogue whether it still answers.
// Results go to data/linkstatus.json. An entry counts as broken after two failed runs in a row, so one
// timeout at the source does not throw it out; publish.mjs then leaves it out of the website.
//
//   node crawler/check-links.mjs                 check everything
//   node crawler/check-links.mjs --max 4000      the 4000 entries that were checked longest ago (nightly rotation)
//   node crawler/check-links.mjs --sample 50     random sample (quick run)
//   node crawler/check-links.mjs --quelle polyhaven

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { politeFetch, setHostGap } from './lib/http.mjs';
import { ladeKatalog } from './lib/store.mjs';

export const BROKEN_AFTER = 2;

/** All URLs of an entry that must work for the card to be useful. */
export function urlsOf(item) {
  const urls = [{ role: 'quelle', url: item.source.url }];
  if (item.preview?.thumb) urls.push({ role: 'vorschaubild', url: item.preview.thumb });
  if (item.preview?.url && item.preview.url !== item.preview.thumb) urls.push({ role: 'vorschau', url: item.preview.url });
  for (const d of item.downloads ?? []) urls.push({ role: 'download', url: d.url });
  const seen = new Set();
  return urls.filter((u) => (seen.has(u.url) ? false : seen.add(u.url)));
}

/** HEAD first; servers that refuse HEAD get a GET for the first byte only.
 *  For files (role other than 'quelle') an HTML answer counts as failure: that is a bot challenge or an
 *  error page in place of the file, which a browser could not use either. */
export async function probe(url, { timeout = 15000, datei = false } = {}) {
  try {
    let res = await politeFetch(url, { method: 'HEAD', timeout, retries: 1 });
    if ([403, 405, 501].includes(res.status) || (res.status === 404 && /github\.com\/.+\/archive\//.test(url))) {
      res = await politeFetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, timeout, retries: 1 });
      await res.body?.cancel().catch(() => {});
    }
    // 429 and 503 mean "slow down" or "try later", not "gone": the result counts as unknown.
    if (res.status === 429 || res.status === 503) return { ok: null, status: res.status };
    if (datei && res.ok && /^text\/html/i.test(res.headers.get('content-type') ?? '')) return { ok: false, status: res.status, error: 'HTML statt Datei (Sperrseite?)' };
    return { ok: res.status >= 200 && res.status < 400, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.name === 'TimeoutError' ? 'Zeitüberschreitung' : String(err.message ?? err) };
  }
}

/** Folds one run into the stored status of an entry. */
export function nextStatus(prev, results, now = new Date().toISOString()) {
  const failed = results.filter((r) => r.ok === false);
  const unknown = results.some((r) => r.ok === null);
  // Nothing failed but something was unknown: keep the previous count instead of resetting it.
  const fails = failed.length ? (prev?.fails ?? 0) + 1 : unknown ? prev?.fails ?? 0 : 0;
  return {
    checkedAt: now,
    ok: failed.length === 0,
    unklar: unknown || undefined,
    fails,
    broken: fails >= BROKEN_AFTER,
    failed: failed.map((r) => ({ role: r.role, url: r.url, status: r.status, error: r.error })),
  };
}

/**
 * A server that turns away a large share of our requests with 403 or 429 is throttling or blocking the
 * checker, not telling us that each of those files is gone. Such results become "unknown" (ok: null), so
 * a rate limit at one source cannot hide its entries. Mutates the result objects, returns the hosts.
 */
export function gedrosselteHosts(alle, { mindestens = 10, anteil = 0.3 } = {}) {
  const proHost = new Map();
  for (const r of alle) {
    let host;
    try { host = new URL(r.url).host; } catch { continue; }
    const h = proHost.get(host) ?? { gesamt: 0, abgewiesen: [] };
    h.gesamt++;
    if (r.ok === false && (r.status === 403 || r.status === 429)) h.abgewiesen.push(r);
    proHost.set(host, h);
  }
  const hosts = [];
  for (const [host, h] of proHost) {
    if (h.abgewiesen.length >= mindestens && h.abgewiesen.length / h.gesamt >= anteil) {
      hosts.push(host);
      for (const r of h.abgewiesen) { r.ok = null; r.error = 'Server weist Prüfer ab'; }
    }
  }
  return hosts;
}

async function pool(items, size, fn) {
  let i = 0;
  const workers = Array.from({ length: size }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const { SOURCES } = await import('./sources/index.mjs');
  const katalog = await ladeKatalog(SOURCES.map((s) => s.id));
  let status = {};
  try {
    status = JSON.parse(await readFile('data/linkstatus.json', 'utf8'));
  } catch {}

  let items = katalog.items;
  if (arg('--quelle')) items = items.filter((it) => it.source.id === arg('--quelle'));
  if (arg('--sample')) items = [...items].sort(() => Math.random() - 0.5).slice(0, Number(arg('--sample')));
  // With tens of thousands of entries one night is not enough for all of them: never-checked entries
  // first, then those whose last check is oldest. Entries that failed once come round again first.
  if (arg('--max')) {
    const alter = (it) => (status[it.id]?.fails ? '' : status[it.id]?.checkedAt ?? '');
    items = [...items].sort((a, b) => alter(a).localeCompare(alter(b))).slice(0, Number(arg('--max')));
  }

  // Big CDNs can take more than the default one request per second.
  setHostGap('upload.wikimedia.org', 1200);
  for (const host of ['dl.polyhaven.org', 'cdn.polyhaven.com', 'raw.githubusercontent.com', 'codeload.github.com', 'github.com', 'archive.org', 'ia800000.us.archive.org']) setHostGap(host, 250);

  console.log(`Prüfe ${items.length} Einträge …`);
  setHostGap('live.staticflickr.com', 1500);
  let done = 0;
  const ergebnisse = new Map();
  await pool(items, 8, async (item) => {
    const results = [];
    for (const u of urlsOf(item)) results.push({ ...u, ...(await probe(u.url, { datei: u.role !== 'quelle' })) });
    ergebnisse.set(item.id, results);
    if (++done % 250 === 0) console.log(`  ${done}/${items.length}`);
  });
  const gedrosselt = gedrosselteHosts([...ergebnisse.values()].flat());
  if (gedrosselt.length) console.log(`Abgewiesen von: ${gedrosselt.join(', ')} (zählt als unklar, nicht als tot)`);
  const jetzt = new Date().toISOString();
  for (const [id, results] of ergebnisse) status[id] = nextStatus(status[id], results, jetzt);

  // Status of entries that left the catalogue is dropped.
  const ids = new Set(katalog.items.map((it) => it.id));
  for (const id of Object.keys(status)) if (!ids.has(id)) delete status[id];

  await writeFile('data/linkstatus.json', JSON.stringify(status, null, 1));

  const checked = items.map((it) => ({ it, s: status[it.id] }));
  const failing = checked.filter((c) => !c.s.ok);
  const broken = checked.filter((c) => c.s.broken);
  const date = new Date().toISOString().slice(0, 10);
  await mkdir('reports', { recursive: true });
  const lines = [
    `# Linkprüfung ${date}`,
    '',
    `Geprüft: ${checked.length} von ${katalog.items.length} · fehlerhaft in diesem Lauf: ${failing.length} · ausgeblendet (≥ ${BROKEN_AFTER} Läufe in Folge): ${broken.length}`,
    ...(gedrosselt.length ? ['', `Server, die den Prüfer abgewiesen haben (Ergebnis unklar): ${gedrosselt.join(', ')}`] : []),
    '',
    ...failing.map((c) => `- ${c.s.broken ? '**ausgeblendet**' : 'Warnung'} \`${c.it.id}\` ${c.it.title}: ${c.s.failed.map((f) => `${f.role} ${f.status || f.error} ${f.url}`).join('; ')}`),
  ];
  await writeFile(`reports/linkpruefung-${date}.md`, lines.join('\n') + '\n');
  console.log(`Fertig. Fehlerhaft: ${failing.length}, ausgeblendet: ${broken.length}. Bericht: reports/linkpruefung-${date}.md`);
}

if (process.argv[1]?.endsWith('check-links.mjs')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
