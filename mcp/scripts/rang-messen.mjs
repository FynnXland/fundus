import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { erstelleKern } from '../src/kern.mjs';
// Places of expected entries and the first rows for fixed searches, straight through the MCP core over a data folder.
//   node mcp/scripts/rang-messen.mjs public/data
// Compare before and after a change to the ranking (BONUS in mcp/src/kern.mjs: 0 switches popularity off).
const DATEN = process.argv[2] ?? 'public/data';
const holen = async (url) => { try { return new Response(readFileSync(join(DATEN, new URL(url).pathname.replace(/^\/data\//, '')))); } catch { return new Response('', { status: 404 }); } };
const kern = erstelleKern({ daten: 'http://x/data', fetch: holen });
const F = [
  ['game engine', 'projekt', 'github:godotengine/godot'], ['vector database', 'projekt', 'github:milvus-io/milvus'], ['pdf parser', 'projekt', null],
  ['markdown editor', 'projekt', 'github:marktext/marktext'], ['terminal emulator', 'projekt', 'github:alacritty/alacritty'], ['password manager', 'projekt', null],
  ['react', 'projekt', null], ['static site generator', 'projekt', 'github:gohugoio/hugo'], ['image upscaler', 'projekt', null],
  ['monospace font', null, null], ['wooden chair', '3d', null], ['rain', 'sound', null], ['sunset', 'hdri', null], ['brick wall', 'textur', null],
  ['pixel heart', 'icon', null], ['cats', 'bild', null], ['calm piano', 'musik', null], ['blender addon', 'skript', null], ['code review', 'skill', null],
];
for (const [q, art, erwartet] of F) {
  const t0 = performance.now();
  const e = await kern.suchen({ q, art, limit: 8 });
  let platz = '';
  if (erwartet) { const alle = await kern.suchen({ q, art, limit: 50 }); const i = alle.treffer.findIndex((r) => r.id === erwartet); platz = ` | ${erwartet.split('/').pop()}: Platz ${i < 0 ? '>50' : i + 1}`; }
  console.log(`${q} [${art ?? 'alle'}] ${e.gesamt ?? '?'} Treffer, ${e.abrufe} Teile, ${(performance.now() - t0).toFixed(0)} ms${platz}\n   ${e.treffer.slice(0, 6).map((r) => r.titel.slice(0, 26) + (r.pop ? ' (' + r.pop[0] + ')' : '')).join(' | ')}`);
}
