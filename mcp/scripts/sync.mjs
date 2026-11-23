// Copies the shared search code into the package, so a published package (npx) carries it.
// tests/mcp.test.mjs fails when the copy differs from crawler/lib/suchindex.mjs.
import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const von = fileURLToPath(new URL('../../crawler/lib/suchindex.mjs', import.meta.url));
const nach = fileURLToPath(new URL('../src/suchindex.mjs', import.meta.url));
await copyFile(von, nach);
console.error(`kopiert: ${von} -> ${nach}`);
