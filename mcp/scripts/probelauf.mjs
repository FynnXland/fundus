// Real run of the local server against a running site (default the Vite dev server on port 4570):
// starts src/stdio.mjs as a client would, calls every tool and downloads one small file into a temp folder.
//   node scripts/probelauf.mjs [site-url] [--legacy]
// Prints each answer with its size (characters, rough tokens = characters / 3.5) to stdout.
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4570';
const ziel = await mkdtemp(path.join(tmpdir(), 'fundus-mcp-'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../src/stdio.mjs', import.meta.url))],
  env: { ...process.env, FUNDUS_URL: url, FUNDUS_ZIEL: ziel },
  stderr: 'inherit',
});
const client = new Client({ name: 'fundus-probe', version: '0.0.0' });
await client.connect(transport);

let summe = 0;
function zeige(name, r) {
  const t = r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const bilder = r.content.filter((c) => c.type === 'image');
  const tokens = Math.round(t.length / 3.5);
  summe += tokens;
  console.log(`\n=== ${name}${r.isError ? ' (FEHLER)' : ''}: ${t.length} Zeichen ≈ ${tokens} Tokens${bilder.length ? `, ${bilder.length} Bild(er) ${bilder.map((b) => `${b.mimeType} ${Math.round((b.data.length * 3) / 4 / 1024)} KB`).join(', ')}` : ''}`);
  console.log(t);
  return { t, bilder };
}

const werkzeuge = await client.listTools();
const liste = JSON.stringify(werkzeuge.tools);
console.log(`Werkzeuge: ${werkzeuge.tools.map((w) => w.name).join(', ')} (Liste ${liste.length} Zeichen ≈ ${Math.round(liste.length / 3.5)} Tokens)`);
const ruf = (name, args) => client.callTool({ name, arguments: args });

zeige('fundus_catalog', await ruf('fundus_catalog', {}));
zeige('fundus_catalog 3d', await ruf('fundus_catalog', { kind: '3d' }));
const s = zeige('fundus_search chair 3d', await ruf('fundus_search', { query: 'chair', kind: '3d', limit: 10 }));
const ids = s.t.split('\n').slice(2).map((z) => z.split('\t')[0]).filter(Boolean);
zeige('fundus_search Möbel gltf (Filter)', await ruf('fundus_search', { kind: '3d', subfolder: 'Möbel', format: 'gltf', limit: 5 }));
zeige('fundus_search seite 2', await ruf('fundus_search', { query: 'chair', kind: '3d', limit: 10, cursor: 'a' }));
const bogen = zeige('fundus_preview sheet', await ruf('fundus_preview', { ids: ids.slice(0, 6) }));
const einzel = zeige('fundus_preview single', await ruf('fundus_preview', { ids: ids.slice(0, 1), layout: 'single' }));
zeige('fundus_details', await ruf('fundus_details', { ids: ids.slice(0, 1) }));
const stl = 'wikimedia:88992301';
zeige('fundus_details stl', await ruf('fundus_details', { ids: [stl] }));
zeige('fundus_download stl', await ruf('fundus_download', { id: stl }));
zeige('fundus_download zu gross', await ruf('fundus_download', { id: ids[0], max_mb: 1 }));
console.log(`\nInhalt von ${ziel}: ${(await readdir(ziel)).join(', ')}`);
const lizenz = (await readdir(ziel)).find((f) => f.endsWith('.lizenz.txt'));
if (lizenz) console.log(await readFile(path.join(ziel, lizenz), 'utf8'));
for (const [name, b] of [['bogen', bogen.bilder[0]], ['einzel', einzel.bilder[0]]]) {
  if (b) {
    const datei = path.join(ziel, `${name}.webp`);
    await (await import('node:fs/promises')).writeFile(datei, Buffer.from(b.data, 'base64'));
    console.log(`Bild gespeichert: ${datei}`);
  }
}
console.log(`\nSumme Text ≈ ${summe} Tokens`);
await client.close();

// remote variant in-process: the HTTP handler (as in the Worker) over the same data, without contact sheets
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client');
const { erstelleKern } = await import('../src/kern.mjs');
const { erstelleHttp } = await import('../src/http.mjs');
const http = erstelleHttp({ kern: erstelleKern({ daten: `${url}/data`, vorschau: `${url}/vorschau` }) });
const fern = new Client({ name: 'fundus-probe-http', version: '0.0.0' });
await fern.connect(new StreamableHTTPClientTransport(new URL('https://fundus.local/mcp'), { fetch: (u, init) => http(new Request(u, init)) }));
console.log(`\n--- HTTP-Zugang: ${(await fern.listTools()).tools.map((w) => w.name).join(', ')}`);
zeige('http fundus_search hdri', await fern.callTool({ name: 'fundus_search', arguments: { kind: 'hdri', query: 'sunset', limit: 3 } }));
zeige('http fundus_preview (ohne Codec)', await fern.callTool({ name: 'fundus_preview', arguments: { ids: ids.slice(0, 2) } }));
zeige('http fundus_download_links', await fern.callTool({ name: 'fundus_download_links', arguments: { id: ids[0] } }));
await fern.close();
