// Measures group keys on the published set (the same filters and merges as publish.mjs) and prints a sample per
// source for checking by eye. Basis of docs/stand/fundus-gruppen.md.
//   node crawler/gruppen-messen.mjs [--probe 8] [--seed 1]
import { readFile } from 'node:fs/promises';
import { ladeKatalog } from './lib/store.mjs';
import { SOURCES } from './sources/index.mjs';
import { dedupe, inhaltsDubletten } from './lib/dedupe.mjs';
import { publishable } from './publish.mjs';
import { bildeGruppen, stamm, MINDEST } from './lib/gruppen.mjs';

const arg = (n, d) => (process.argv.includes(n) ? Number(process.argv[process.argv.indexOf(n) + 1]) : d);
const PROBE = arg('--probe', 8);
let saat = arg('--seed', 1);
const zufall = () => (saat = (saat * 1103515245 + 12345) % 2147483648) / 2147483648;
const ziehe = (liste, n) => { const k = [...liste]; const o = []; while (o.length < n && k.length) o.push(k.splice(Math.floor(zufall() * k.length), 1)[0]); return o; };
const lies = async (p, d) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return d; } };

const katalog = await ladeKatalog(SOURCES.map((s) => s.id));
const { items: gueltig } = publishable(katalog, await lies('data/linkstatus.json', {}), await lies('data/gesperrt.json', {}), await lies('data/rechtecheck.json', { titel: {} }));
const { items } = inhaltsDubletten(dedupe(gueltig), await lies('data/vorschauen.json', {}));
console.log(`Veröffentlichte Einträge: ${items.length} (Stand der Daten ${katalog.crawledAt ?? '?'})`);

/** Groups of a candidate key with at least MINDEST members: count, members, per source. */
function zaehle(name, key) {
  const m = new Map();
  for (const it of items) { const k = key(it); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
  const gr = [...m].filter(([, l]) => l.length >= MINDEST);
  const n = gr.reduce((s, [, l]) => s + l.length, 0);
  console.log(`  ${name}: ${gr.length} Gruppen, ${n} Mitglieder, größte ${Math.max(0, ...gr.map(([, l]) => l.length))}`);
  return gr;
}

console.log('\nVerworfene oder geprüfte Kandidaten:');
const kennt = (n) => n && !/^(unbekannt|unknown|anonym|anonymous|see above|various)/i.test(n.trim());
zaehle('Iconify-Set (jeder Eintrag ist schon ein Set)', (it) => it.source.id === 'iconify' && it.collection?.id);
zaehle('Internet Archive, Album (gleicher Titel und Urheber)', (it) => it.source.id === 'internetarchive' && `${it.title}|${it.creator.name}`);
const ia = zaehle('Internet Archive, Sammlung', (it) => it.source.id === 'internetarchive' && it.meta?.sammlung);
for (const [k, l] of ia) console.log(`     ${k}: ${l.length} Einträge von ${new Set(l.map((x) => x.creator.name)).size} Urhebern`);
const urheber = zaehle('Urheber allein (Bildquellen)', (it) => ['wikimedia', 'wellcome', 'cleveland', 'wikimediavideo'].includes(it.source.id) && kennt(it.creator.name) && `${it.source.id}|${it.kind}|${it.creator.name}`);
console.log(`     größte: ${urheber.sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([k, l]) => `${k.split('|')[2]} ${l.length}`).join(', ')}`);
const gleich = zaehle('gleicher Titel ohne Zähler, gleicher Urheber, ab 3 Wörtern', (it) => !it.collection && kennt(it.creator.name) && !stamm(it.title)?.zaehler && it.title.trim().split(/\s+/).length >= 3 && `${it.source.id}|${it.kind}|${it.creator.name}|${it.title.trim().toLowerCase()}`);
// Commons: per creator the most specific category three or more of their entries share
const commons = new Map();
const proUrheber = new Map();
for (const it of items) if (['wikimedia', 'wikimediavideo', 'commonsaudio'].includes(it.source.id) && kennt(it.creator.name)) { const k = `${it.source.id}|${it.creator.name}`; if (!proUrheber.has(k)) proUrheber.set(k, []); proUrheber.get(k).push(it); }
for (const [k, l] of proUrheber) {
  const z = new Map(); for (const it of l) for (const t of it.tags) z.set(t, (z.get(t) ?? 0) + 1);
  for (const it of l) { const t = it.tags.filter((x) => z.get(x) >= MINDEST).sort((a, b) => z.get(a) - z.get(b))[0]; if (t) { const kk = `${k}|${t}`; if (!commons.has(kk)) commons.set(kk, []); commons.get(kk).push(it); } }
}
const cgr = [...commons].filter(([, l]) => l.length >= MINDEST);
console.log(`  Commons-Kategorie (spezifischste geteilte je Urheber): ${cgr.length} Gruppen, ${cgr.reduce((s, [, l]) => s + l.length, 0)} Mitglieder`);

const zeig = (titel, liste) => {
  console.log(`\n${titel}`);
  for (const [k, l] of liste) console.log(`   [${l.length}] ${k.slice(0, 90)} :: ${[...new Set(l.map((x) => x.title))].slice(0, 4).join(' | ').slice(0, 200)}`);
};
zeig('Stichprobe gleicher Titel ohne Zähler', ziehe(gleich, 20));
zeig('Stichprobe Commons-Kategorie', ziehe(cgr, 20));

// the rules that are used
const gruppen = bildeGruppen(items);
const g = [...gruppen.values()];
const mitglieder = g.reduce((s, x) => s + x.mitglieder.length, 0);
console.log(`\nGewählte Regeln: ${g.length} Gruppen ab ${MINDEST} Mitgliedern, ${mitglieder} Mitglieder (${((100 * mitglieder) / items.length).toFixed(1)} % des Katalogs)`);
for (const art of ['sammlung', 'reihe']) {
  const t = g.filter((x) => x.schluessel.startsWith(art));
  console.log(`  ${art}: ${t.length} Gruppen, ${t.reduce((s, x) => s + x.mitglieder.length, 0)} Mitglieder`);
}
const groessen = g.map((x) => x.mitglieder.length).sort((a, b) => a - b);
const q = (p) => groessen[Math.floor(p * (groessen.length - 1))];
console.log(`  Größe: Median ${q(0.5)}, 90 % bis ${q(0.9)}, größte ${groessen.at(-1)}; ab 100 Mitgliedern: ${groessen.filter((n) => n >= 100).length}`);
const karten = items.length - mitglieder + g.length;
console.log(`  Karten im Raster statt ${items.length}: ${karten}`);
const proQA = new Map();
for (const x of g) { const k = `${x.quelle}/${x.art}`; const v = proQA.get(k) ?? [0, 0]; v[0]++; v[1] += x.mitglieder.length; proQA.set(k, v); }
console.log('  pro Quelle/Art (Gruppen, Mitglieder):');
for (const [k, [n, m]] of [...proQA].sort((a, b) => b[1][1] - a[1][1])) console.log(`     ${k}: ${n}, ${m}`);

// sample per source and kind for checking by eye
console.log(`\nStichprobe der gewählten Regeln, bis ${PROBE} je Quelle/Art:`);
for (const k of [...proQA.keys()].sort()) {
  const t = g.filter((x) => `${x.quelle}/${x.art}` === k);
  console.log(`\n ${k} (${t.length})`);
  for (const x of ziehe(t, PROBE)) {
    const titel = [...new Set(x.mitglieder.map((m) => m.title))];
    const wer = new Set(x.mitglieder.map((m) => m.creator?.name));
    console.log(`   [${x.mitglieder.length}] «${x.name}»${wer.size > 1 ? ` {${wer.size} Urheber}` : ''} :: ${titel.slice(0, 5).join(' | ').slice(0, 230)}`);
  }
}
