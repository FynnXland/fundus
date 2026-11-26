// Small eval with a real AI: four tasks from the live test of 26.11.2026, each run once by `claude -p` with only the
// Fundus MCP server. Counts tool calls, searches without matches and the length of the answer.
//   node mcp/scripts/eval-ki.mjs [--url http://127.0.0.1:4572/mcp] [--modell claude-sonnet-5-5] [--aus <ordner>] [--nur 1,3]
// Needs a running server (npm run build:web, then npx wrangler dev). Writes <aus>/<nr>.jsonl (raw stream) and
// <aus>/ergebnis.json, prints a table.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const arg = (name, standard) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : standard);
const URL_MCP = arg('--url', 'http://127.0.0.1:4572/mcp');
const MODELL = arg('--modell', 'claude-sonnet-5-5');
const AUS = arg('--aus', join(tmpdir(), `fundus-eval-${Date.now()}`));
const NUR = arg('--nur', '');

export const AUFGABEN = [
  'Ich baue ein kleines Retro-Spiel. Finde in Fundus eine freie Pixel-Schrift sowie ein Herz-Icon und ein Münz-Icon im Pixel-Stil. Nenne je Fund ID und Lizenz.',
  'Finde in Fundus zwei oder drei ruhige, freie Musikstücke als Hintergrund für ein Erklärvideo. Nenne je Stück ID, Titel und Lizenz.',
  'Finde in Fundus ein CC0-HDRI mit Sonnenuntergang und eine Holzboden-Textur für eine Blender-Szene. Nenne je Fund ID und Lizenz.',
  'Finde in Fundus einen Claude-Skill für Git-Commits oder für Code-Review. Nenne ID, Titel und Lizenz.',
];

function lauf(nr, aufgabe, konfig) {
  return new Promise((fertig) => {
    const args = ['-p', `${aufgabe} Antworte knapp.`, '--mcp-config', konfig, '--strict-mcp-config', '--allowedTools', 'mcp__fundus__*', '--model', MODELL, '--output-format', 'stream-json', '--verbose'];
    const kind = spawn(process.platform === 'win32' ? 'claude.exe' : 'claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let roh = '';
    kind.stdout.on('data', (d) => { roh += d; });
    kind.stderr.on('data', () => {});
    kind.on('close', () => {
      writeFileSync(join(AUS, `${nr}.jsonl`), roh);
      const zeilen = roh.split('\n').filter(Boolean).map((z) => { try { return JSON.parse(z); } catch { return null; } }).filter(Boolean);
      const aufrufe = [];
      const ergebnisse = new Map();
      for (const z of zeilen) {
        for (const c of z.message?.content ?? []) {
          if (c.type === 'tool_use') aufrufe.push({ id: c.id, name: c.name.replace(/^mcp__fundus__/, ''), input: c.input });
          if (c.type === 'tool_result') ergebnisse.set(c.tool_use_id, Array.isArray(c.content) ? c.content.map((x) => x.text ?? '').join('') : String(c.content ?? ''));
        }
      }
      const schluss = zeilen.find((z) => z.type === 'result') ?? {};
      const suchen = aufrufe.filter((a) => a.name === 'fundus_search');
      // empty = no table rows (a fallback answer starts with "No entry … matches all words" but has rows)
      const leer = suchen.filter((a) => !/\nid\t/.test(ergebnisse.get(a.id) ?? ''));
      // the Worker's rate limit (60 per minute) also applies to wrangler dev: such a run does not count
      const gebremst = aufrufe.filter((a) => /Zu viele Anfragen|429/.test(ergebnisse.get(a.id) ?? '')).length;
      fertig({
        nr,
        aufrufe: aufrufe.length,
        suchen: suchen.length,
        leer: leer.length,
        gebremst,
        anfragen: suchen.map((a) => `${a.input.query ?? ''}${a.input.kind ? ` [${a.input.kind}]` : ''}`),
        antwortZeichen: (schluss.result ?? '').length,
        werkzeugZeichen: [...ergebnisse.values()].reduce((s, t) => s + t.length, 0),
        sekunden: Math.round((schluss.duration_ms ?? 0) / 1000),
        kosten: schluss.total_cost_usd ?? null,
        antwort: schluss.result ?? '',
      });
    });
  });
}

mkdirSync(AUS, { recursive: true });
const konfig = join(AUS, 'mcp.json');
writeFileSync(konfig, JSON.stringify({ mcpServers: { fundus: { type: 'http', url: URL_MCP } } }));
const auswahl = AUFGABEN.map((a, i) => [i + 1, a]).filter(([n]) => !NUR || NUR.split(',').map(Number).includes(n));
const ergebnis = await Promise.all(auswahl.map(([n, a]) => lauf(n, a, konfig)));
writeFileSync(join(AUS, 'ergebnis.json'), JSON.stringify(ergebnis, null, 1));
for (const e of ergebnis) {
  console.log(`${e.nr}: ${e.aufrufe} Aufrufe, ${e.suchen} Suchen (${e.leer} ohne Treffer${e.gebremst ? `, ${e.gebremst} vom Ratenlimit gebremst: zählt nicht` : ''}), Antwort ${e.antwortZeichen} Zeichen, Werkzeugtext ${e.werkzeugZeichen} Zeichen, ${e.sekunden} s`);
  console.log(`   Suchen: ${e.anfragen.join(' | ')}`);
}
console.log(`Rohdaten: ${AUS}`);
