// Copies the shared search code into the package, so a published package (npx) carries it.
// tests/mcp.test.mjs fails when a copy differs from its original in crawler/lib/.
import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

for (const datei of ['suchindex.mjs', 'synonyme.mjs']) {
  const von = fileURLToPath(new URL(`../../crawler/lib/${datei}`, import.meta.url));
  const nach = fileURLToPath(new URL(`../src/${datei}`, import.meta.url));
  await copyFile(von, nach);
  console.error(`kopiert: ${von} -> ${nach}`);
}
