// Free Music Archive über erlaubte Wege (26.11.2026): kein eigener FMA-Adapter (Bedingungen, docs/RECHT.md),
// dafür nimmt der Internet-Archive-Adapter alle Fassungen von CC BY und BY-SA an, auch die Länderfassungen.
// Fixture: echte, gekürzte /metadata/-Antworten vom 26.11.2026 (freemusicarchive und netlabels).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateItem } from '../crawler/lib/schema.mjs';
import * as ia from '../crawler/sources/internetarchive.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/internetarchive-portiert.json', import.meta.url), 'utf8'));
const valid = (it) => assert.deepEqual(validateItem(it), [], JSON.stringify(it, null, 1));

test('FMA über Internet Archive: Länderfassung BY-SA 3.0 AU behält ihre eigene Lizenzseite', () => {
  const it = ia.parseItem(fx.fmaPortiert, { kind: 'musik' });
  valid(it);
  assert.equal(it.id, 'internetarchive:Lets_Go_Arctic-11859');
  assert.equal(it.creator.name, 'Lakes');
  assert.deepEqual(
    [it.license.id, it.license.name, it.license.url, it.license.shareAlike],
    ['CC-BY-SA-3.0-AU', 'CC BY-SA 3.0 AU', 'https://creativecommons.org/licenses/by-sa/3.0/au/deed.de', true],
  );
  assert.match(it.attribution, /CC BY-SA 3\.0 AU/);
  assert.equal(it.meta.sammlung, 'freemusicarchive');
  assert.equal(it.preview.url, 'https://archive.org/download/Lets_Go_Arctic-11859/Lakes_-_01_-_Lets_Go_Arctic.mp3');
});

test('FMA über Internet Archive: Netlabel mit CC BY 2.1 JP (gibt es nur als Länderfassung)', () => {
  const it = ia.parseItem(fx.netlabelJp);
  valid(it);
  assert.equal(it.license.id, 'CC-BY-2.1-JP');
  assert.equal(it.license.url, 'https://creativecommons.org/licenses/by/2.1/jp/deed.de');
  assert.equal(it.meta.sammlung, 'oloil');
});

test('Internet Archive: Lizenzadressen, was rein darf und was nicht', () => {
  const id = (u) => ia.licenseFromUrl(u)?.id ?? null;
  assert.equal(id('http://creativecommons.org/licenses/by/3.0/'), 'CC-BY-3.0');
  assert.equal(id('https://creativecommons.org/licenses/by-sa/4.0'), 'CC-BY-SA-4.0');
  assert.equal(id('http://creativecommons.org/licenses/by/1.0/fi/'), 'CC-BY-1.0-FI');
  assert.equal(id('http://creativecommons.org/licenses/by-sa/2.5/scotland/'), 'CC-BY-SA-2.5-SCOTLAND');
  assert.equal(id('http://creativecommons.org/licenses/by/2.0/'), 'CC-BY-2.0');
  assert.equal(id('http://creativecommons.org/publicdomain/zero/1.0/'), 'CC0-1.0');
  assert.equal(id('https://creativecommons.org/publicdomain/mark/1.0/'), 'PDM-1.0');
  // out: NC, ND, Sampling+, the FMA licence, orphan works, ports of 4.0, 2.1 without port, deed pages, other hosts
  for (const u of [
    'http://creativecommons.org/licenses/by-nc/3.0/',
    'http://creativecommons.org/licenses/by-nc-sa/3.0/us/',
    'http://creativecommons.org/licenses/by-nd/3.0/',
    'http://creativecommons.org/licenses/sampling+/1.0/',
    'http://creativecommons.org/choose/publicdomain-2',
    'http://creativecommons.org/licenses/publicdomain/',
    'http://freemusicarchive.org/FMA_License',
    'http://en.wikipedia.org/wiki/Orphan_work',
    'http://creativecommons.org/licenses/by/4.0/de/',
    'http://creativecommons.org/licenses/by/2.1/',
    'http://creativecommons.org/licenses/by/3.0/deed.en',
    'http://creativecommons.org/licenses/by/3.0/legalcode',
    'http://creativecommons.org/licenses/by-sa/4.0/rdf',
    'http://creativecommons.org/licenses/by/3.0/us/legalcode',
    'http://creativecommons.org.example.com/licenses/by/3.0/',
    undefined,
  ]) assert.equal(ia.licenseFromUrl(u), null, String(u));
});

test('Internet Archive: Suche mit vier Platzhalter-Klauseln, Schrägstriche maskiert', () => {
  const q = new URL(ia.searchUrl('freemusicarchive', 100, 1, { sort: 'addeddate asc' })).searchParams.get('q');
  assert.match(q, /collection:"freemusicarchive"/);
  assert.match(q, /licenseurl:\*creativecommons\.org\\\/licenses\\\/by\\\/\*/);
  assert.match(q, /licenseurl:\*creativecommons\.org\\\/licenses\\\/by-sa\\\/\*/);
  assert.match(q, /publicdomain\\\/zero\\\//);
  assert.match(q, /publicdomain\\\/mark\\\//);
  assert.ok(!/by-nc|by-nd/.test(q));
});

test('Internet Archive: Stand mit alter Lizenzliste liest die Sammlung neu, neuer Stand bleibt', () => {
  const alt = {
    version: 1,
    sammlungen: {
      netlabels: { art: 'musik', richtung: 'asc', offset: 198, fertig: false, runde: 1, treffer: 5887 },
      freemusicarchive: { art: 'musik', richtung: 'asc', offset: 286, fertig: true, fertigAm: '2026-11-23', runde: 1, treffer: 286 },
    },
  };
  const cols = [{ id: 'netlabels', art: 'musik' }, { id: 'freemusicarchive', art: 'musik' }];
  const st = ia.prepareState(alt, cols, { heute: '2026-11-26' });
  for (const id of ['netlabels', 'freemusicarchive']) {
    const e = st.sammlungen[id];
    assert.deepEqual([e.offset, e.richtung, e.fertig, e.runde, e.lizenzen], [0, 'asc', false, 1, ia.LIZENZSTAND], id);
  }
  // Read once with the new list, the offset is kept.
  const weiter = structuredClone(st);
  weiter.sammlungen.netlabels.offset = 500;
  assert.equal(ia.prepareState(weiter, cols, { heute: '2026-11-27' }).sammlungen.netlabels.offset, 500);
});

test('Internet Archive: crawl() setzt einen alten Stand zurück und übernimmt Länderfassungen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fundus-fma-'));
  const real = globalThis.fetch;
  try {
    const stand = join(dir, 'ia.json');
    await writeFile(stand, JSON.stringify({ version: 1, sammlungen: { freemusicarchive: { art: 'musik', richtung: 'asc', offset: 1, fertig: false, runde: 1 } } }));
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      const body = String(url).includes('advancedsearch')
        ? { response: { numFound: 1, start: 0, docs: [{ identifier: 'Lets_Go_Arctic-11859', addeddate: '2012-06-04T21:19:24Z' }] } }
        : fx.fmaPortiert;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const items = await ia.default.crawl({ sammlungen: ['freemusicarchive'], budget: 5, stand, abstand: 0 }, () => {});
    // With the old offset 1 the only hit would have been skipped.
    assert.deepEqual(items.map((i) => i.license.id), ['CC-BY-SA-3.0-AU'], 'Offset aus dem alten Stand wurde verworfen');
    assert.equal(calls.filter((u) => u.includes('advancedsearch')).length, 1);
    const saved = JSON.parse(await readFile(stand, 'utf8'));
    assert.equal(saved.sammlungen.freemusicarchive.lizenzen, ia.LIZENZSTAND);
    assert.equal(saved.sammlungen.freemusicarchive.fertig, true);
  } finally {
    globalThis.fetch = real;
    await rm(dir, { recursive: true, force: true });
  }
});
