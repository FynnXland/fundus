// Builds the site for fundus.fynn.land into dist/: like `vite build`, but without public/vorschau (50,000 files,
// more than Workers static assets take; they live in R2, see scripts/vorschau-r2.mjs and worker/index.mjs).
//   node scripts/web-bauen.mjs        (npm run build:web; run crawler/publish.mjs first for fresh data)
import { build } from 'vite';
import { cp, readdir, rm } from 'node:fs/promises';

const AUSSER = new Set(['vorschau']);

await rm('dist', { recursive: true, force: true });
await build({ build: { copyPublicDir: false }, logLevel: 'warn' });
for (const name of await readdir('public')) {
  if (!AUSSER.has(name)) await cp(`public/${name}`, `dist/${name}`, { recursive: true });
}
let dateien = 0;
const zaehlen = async (d) => {
  for (const e of await readdir(d, { withFileTypes: true })) e.isDirectory() ? await zaehlen(`${d}/${e.name}`) : dateien++;
};
await zaehlen('dist');
console.log(`dist/ fertig: ${dateien} Dateien (Grenze Workers Free: 20.000).`);
if (dateien > 20000) process.exitCode = 1;
