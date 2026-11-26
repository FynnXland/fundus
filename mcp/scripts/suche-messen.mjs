// Hit counts and CPU time of fixed searches, straight through the MCP core over a data folder on disk.
//   node mcp/scripts/suche-messen.mjs [--daten dist/data] [--json <datei>]
// Every search runs on a fresh core (empty caches, as in a cold Worker request); the files are read into memory
// first, so the time is parsing and searching, not the disk. Median of 7 runs, the first run of all warms up the JIT.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { erstelleKern } from '../src/kern.mjs';

const arg = (name, standard) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : standard);
const DATEN = arg('--daten', 'dist/data');
const AUS = arg('--json', '');

export const ANFRAGEN = [
  { q: 'pixel heart icon', art: 'icon' },
  { q: 'pixel heart', art: 'icon' },
  { q: 'pixel coin', art: 'icon' },
  { q: 'pixel font' },
  { q: 'pixel', art: 'schrift' },
  { q: 'calm music' },
  { q: 'ambient calm', art: 'musik' },
  { q: 'calm piano', art: 'musik' },
  { q: 'sunset hdri' },
  { q: 'sunset', art: 'hdri' },
  { q: 'wood floor texture' },
  { q: 'wood floor', art: 'textur' },
  { q: 'commit', art: 'skill' },
  { q: 'git commit', art: 'skill' },
  { q: 'code review', art: 'skill' },
  { q: 'chairs', art: '3d' },
  { q: 'cats', art: 'bild' },
  { q: 'wooden chair' },
];

const puffer = new Map();
const holen = async (url) => {
  const pfad = join(DATEN, new URL(url).pathname.replace(/^\/data\//, ''));
  if (!puffer.has(pfad)) puffer.set(pfad, existsSync(pfad) ? readFileSync(pfad, 'utf8') : null);
  const body = puffer.get(pfad);
  return body === null ? new Response('missing', { status: 404 }) : new Response(body, { status: 200 });
};
const neu = () => erstelleKern({ daten: 'http://x/data', fetch: holen });

const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
// stand.json parsing is part of every cold request too, but the same for all searches: measured once
await neu().suchen({ q: 'warm', limit: 10 });
const ergebnis = [];
for (const a of ANFRAGEN) {
  const zeiten = [];
  let e;
  for (let i = 0; i < 7; i++) {
    const kern = neu();
    await kern.stand();
    const t = performance.now();
    e = await kern.suchen({ q: a.q, art: a.art, limit: 10 });
    zeiten.push(performance.now() - t);
  }
  ergebnis.push({ ...a, gesamt: e.gesamt, voll: e.voll ?? e.gesamt, abrufe: e.abrufe, ms: Number(median(zeiten).toFixed(2)), oben: e.treffer.slice(0, 3).map((r) => `${r.titel}${r.fehlt ? ` (-${r.fehlt})` : ''}`) });
}
for (const r of ergebnis) console.log(`${`${r.q}${r.art ? ` [${r.art}]` : ''}`.padEnd(26)} alle Wörter ${String(r.voll ?? '?').padStart(6)}  gesamt ${String(r.gesamt ?? '?').padStart(6)}  ${String(r.ms).padStart(6)} ms  ${r.abrufe} Dateien  | ${r.oben.join(' | ')}`);
console.log(`Median über alle: ${median(ergebnis.map((r) => r.ms))} ms, Maximum ${Math.max(...ergebnis.map((r) => r.ms))} ms`);
if (AUS) writeFileSync(AUS, JSON.stringify(ergebnis, null, 1));
