// Audio sources: Wikimedia Commons audio (category walker) and Internet Archive (staged), against trimmed real
// answers (fetched 23.11.2026) and with a replaced fetch for the crawl loops. No test touches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateItem } from '../crawler/lib/schema.mjs';
import { dedupe, normalizeUrl } from '../crawler/lib/dedupe.mjs';
import * as ca from '../crawler/sources/commonsaudio.mjs';
import * as ia from '../crawler/sources/internetarchive.mjs';

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const valid = (it) => assert.deepEqual(validateItem(it), [], JSON.stringify(it, null, 1));
const sfx = (title) => structuredClone(fx('commonsaudio').sfx.query.pages.find((p) => p.title === title));
const musopen = (title) => structuredClone(fx('commonsaudio').musopen.query.pages.find((p) => p.title === title));
const info = (p) => p.videoinfo[0];

/** Runs fn with a fetch that answers each call from `answers` (function or value), in order. */
async function withFetch(answers, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    const r = typeof a === 'function' ? a(String(url)) : a;
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}

async function inTemp(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'fundus-audio-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Commons audio

test('Commons-Audio: gemeinfreier Soundeffekt mit MP3-Umwandlung als Vorschau, Download ohne utm-Parameter', () => {
  const it = ca.parsePage(sfx('File:Comic spring up or magic trick.ogg'), 'musik');
  valid(it);
  assert.equal(it.id, 'commonsaudio:24006785');
  assert.equal(it.kind, 'sound', 'die Kategorien der Datei entscheiden, nicht die Wurzel');
  assert.match(it.sig, /^SND·A1·/);
  assert.equal(it.license.id, 'PD');
  assert.equal(it.creator.name, 'stephan');
  assert.equal(it.preview.type, 'audio');
  assert.equal(it.preview.url, 'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/4e/Comic_spring_up_or_magic_trick.ogg/Comic_spring_up_or_magic_trick.ogg.mp3');
  assert.equal(it.downloads[0].url, 'https://upload.wikimedia.org/wikipedia/commons/4/4e/Comic_spring_up_or_magic_trick.ogg');
  assert.equal(it.downloads[0].format, 'ogg');
  assert.equal(it.downloads[1].url, it.preview.url);
  assert.equal(it.meta.dauer, '2 s');
  assert.equal(it.hashes.sha1, '22dc222f31749afa565153fb457a1fb5e1a61ee5');
  assert.equal(it.source.url, 'https://commons.wikimedia.org/wiki/File:Comic_spring_up_or_magic_trick.ogg');
  assert.ok(!JSON.stringify(it).includes('utm_'), 'kein Tracking-Parameter im Eintrag');
  // The dedupe key against Openverse (which lists the plain upload URL) must match.
  assert.equal(normalizeUrl(it.downloads[0].url), 'upload.wikimedia.org/wikipedia/commons/4/4e/comic_spring_up_or_magic_trick.ogg');
});

test('Commons-Audio: kein Doppeleintrag mit Openverse, der direkte Eintrag gewinnt', () => {
  const direct = ca.parsePage(sfx('File:Beepalert.wav'), 'sound');
  const viaOpenverse = { ...direct, id: 'openverse:audio/x', via: ['Openverse'], source: { ...direct.source }, downloads: [{ ...direct.downloads[0] }] };
  const out = dedupe([viaOpenverse, direct]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, direct.id);
  assert.deepEqual(out[0].via, ['Openverse']);
});

test('Commons-Audio: WAV mit CC BY-SA, MP3-Original ohne Umwandlung nutzt das Original als Vorschau', () => {
  const wav = ca.parsePage(sfx('File:Beepalert.wav'), 'sound');
  valid(wav);
  assert.equal(wav.license.id, 'CC-BY-SA-3.0');
  assert.equal(wav.downloads.length, 2);
  assert.equal(wav.downloads[0].format, 'wav');
  assert.match(wav.preview.url, /\/transcoded\/.*\.wav\.mp3$/);

  const mp3 = ca.parsePage(sfx('File:ERH - ghostly voices (cc-by) (freesound).mp3'), 'sound');
  valid(mp3);
  assert.equal(mp3.license.id, 'CC-BY-3.0');
  assert.equal(mp3.creator.name, 'ERH');
  assert.equal(mp3.creator.url, 'https://freesound.org/people/ERH/');
  assert.equal(mp3.downloads.length, 1, 'die ogg-Umwandlung ist kein zweiter Download');
  assert.equal(mp3.preview.url, mp3.downloads[0].url);
  assert.ok(!mp3.preview.url.includes('?'));
});

test('Commons-Audio: Bilder, Kategorien und Videos in der Kategorie werden verworfen', () => {
  assert.equal(ca.parsePage(sfx('File:Bird Chirp - Barking Dog.JPG'), 'sound'), null);
  assert.equal(ca.parsePage(sfx('Category:Files from Freesound.org'), 'sound'), null);
  assert.equal(ca.parsePage(musopen('File:A Walk down Main Street, Delta PA.webm'), 'musik'), null);
  assert.equal(ca.parsePage({ pageid: 1, ns: 6, title: 'File:Leer.ogg' }, 'sound'), null, 'Seite ohne videoinfo (kommt mit vicontinue noch einmal)');
});

test('Commons-Audio: Aussprachen und gesprochene Wörter fallen heraus', () => {
  const ll = fx('commonsaudio').aussprache;
  assert.equal(ca.parsePage(ll, 'sound'), null, 'Lingua-Libre-Datei');
  const plain = sfx('File:Beepalert.wav');
  const spoken = structuredClone(plain);
  info(spoken).extmetadata.Categories.value = 'Audio files of sound effects|Spoken English';
  assert.equal(ca.parsePage(spoken, 'sound'), null, 'Kategorie "Spoken …"');
  const prefix = structuredClone(plain);
  prefix.title = 'File:De-Hund.wav';
  info(prefix).duration = 1.4;
  assert.equal(ca.parsePage(prefix, 'sound'), null, 'Sprachpräfix bei sehr kurzer Datei');
  info(prefix).duration = 61;
  assert.ok(ca.parsePage(prefix, 'sound'), 'dieselbe Bezeichnung bei langer Datei bleibt');
  const named = structuredClone(plain);
  info(named).extmetadata.Categories.value = 'Reading, Pennsylvania|Newsome Creek|Audio files of sound effects';
  assert.ok(ca.parsePage(named, 'sound'), 'Ortsnamen mit "Reading" oder "News" lösen den Filter nicht aus');
  for (const name of ['Category:Pronunciation by language', 'Category:Spoken Wikipedia', 'Category:Lingua Libre pronunciation-deu', 'Category:Audiobooks', 'Category:Interviews']) {
    assert.ok(ca.isSpokenCategory(name), name);
  }
  for (const name of ['Category:Reading Railroad', 'Category:Newsboys', 'Category:Speechless (band)', 'Category:Piano music']) assert.ok(!ca.isSpokenCategory(name), name);
});

test('Commons-Audio: Lizenzen nur offen, "no restrictions" und NC/ND fallen heraus', () => {
  const p = sfx('File:Beepalert.wav');
  const withLicense = (name, url) => {
    const q = structuredClone(p);
    info(q).extmetadata.LicenseShortName = { value: name };
    delete info(q).extmetadata.LicenseUrl;
    if (url) info(q).extmetadata.LicenseUrl = { value: url };
    return ca.parsePage(q, 'sound');
  };
  assert.equal(withLicense('No known copyright restrictions'), null);
  assert.equal(withLicense('CC BY-NC-SA 4.0'), null);
  assert.equal(withLicense('CC BY-ND 3.0'), null);
  assert.equal(withLicense('CC BY-NC 4.0', 'https://creativecommons.org/licenses/by-nc/4.0'), null);
  assert.equal(withLicense('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0').license.id, 'CC-BY-4.0');
  assert.equal(withLicense('Attribution only license'), null);
});

test('Commons-Audio: MIDI nur mit abspielbarer MP3-Umwandlung', () => {
  const midi = fx('commonsaudio').midi;
  const it = ca.parsePage(midi, 'sound');
  valid(it);
  assert.equal(it.kind, 'musik', 'MIDI-Kategorie schlägt die Wurzel');
  assert.equal(it.downloads[0].format, 'mid');
  assert.match(it.preview.url, /\.mid\.mp3$/);
  const bare = structuredClone(midi);
  delete info(bare).derivatives;
  assert.equal(ca.parsePage(bare, 'musik'), null);
});

test('Commons-Audio: Urheberzeile ohne Rollenpräfix und ohne tote Benutzerseite, Wartungskategorien nicht als Tags', () => {
  const it = ca.parsePage(musopen('File:Alexander Glazunov - chant du menestrel, op. 71.ogg'), 'musik');
  valid(it);
  assert.ok(it.creator.name.startsWith('Alexander Glazunov'), it.creator.name);
  assert.equal(it.creator.url, undefined, 'Rotlink wird nicht übernommen');
  assert.equal(it.license.id, 'PD');
  assert.equal(it.kind, 'musik');
  assert.ok(!it.tags.some((t) => /unknown date|author died/.test(t)), it.tags.join());
  assert.equal(ca.parsePage(musopen('File:Bach, BWV 147, 10. Jesus bleibet meine Freude.ogg'), 'musik').license.id, 'CC0-1.0');
});

test('Commons-Audio: Art einer Datei hängt nicht von der Wurzel ab, die sie zuerst fand', () => {
  const p = sfx('File:Comic spring up or magic trick.ogg');
  assert.equal(ca.parsePage(p, 'musik').kind, ca.parsePage(p, 'sound').kind);
  const both = structuredClone(p);
  info(both).extmetadata.Categories.value = 'Audio files of music|Sound effects from Free Music Archive';
  assert.equal(ca.kindOf(info(both), 'musik'), 'sound');
  assert.equal(ca.kindOf({ extmetadata: { Categories: { value: 'Piano' } } }, 'musik'), 'musik');
  assert.equal(ca.kindOf({ extmetadata: { Categories: { value: 'Piano' } } }, 'sound'), 'sound');
});

test('Commons-Audio: Wurzeln aus der Konfiguration, Standardwerte, Kategorie-Präfix', () => {
  const roots = ca.rootsFromConfig({ musik: ['Audio files of music', 'Category:Musopen'], sounds: ['Soundscape', 'Audio files of music'] });
  assert.deepEqual(roots, [
    { kat: 'Category:Audio files of music', art: 'musik' },
    { kat: 'Category:Musopen', art: 'musik' },
    { kat: 'Category:Soundscape', art: 'sound' },
  ]);
  const def = ca.rootsFromConfig({});
  assert.ok(def.some((r) => r.kat === 'Category:Xeno-canto' && r.art === 'sound'));
  assert.ok(def.some((r) => r.kat === 'Category:Audio files of music' && r.art === 'musik'));
  assert.equal(new Set(def.map((r) => r.kat)).size, def.length);
  assert.deepEqual(ca.rootsFromConfig({ wurzeln: [{ kategorie: 'X_y', art: 'sound' }, { kategorie: 'Z', art: 'bild' }] }), [{ kat: 'Category:X y', art: 'sound' }]);
});

test('Commons-Audio: Anfrageparameter, Unterkategorien zuerst, ganzes continue-Objekt wird zurückgegeben', () => {
  const p = ca.requestParams({ k: 'Category:Musopen', weiter: null });
  assert.equal(p.gcmtype, 'subcat|file');
  assert.equal(p.generator, 'categorymembers');
  assert.equal(p.gcmtitle, 'Category:Musopen');
  assert.match(p.viprop, /derivatives/);
  const next = ca.requestParams({ k: 'Category:Musopen', weiter: { gcmcontinue: 'file|AB|1', vicontinue: '5|', continue: '||' } });
  assert.equal(next.gcmcontinue, 'file|AB|1');
  assert.equal(next.vicontinue, '5|');
});

test('Commons-Audio: Warteschlange, Unterkategorien, Tiefe, Ausschluss und faire Reihenfolge', () => {
  const roots = ca.rootsFromConfig({ musik: ['Audio files of music'], sounds: ['Audio files of sound effects'] });
  let st = ca.prepareState(null, roots, { heute: '2026-11-23' });
  assert.equal(st.warteschlange.length, 2);
  assert.equal(ca.nextEntry(st).k, 'Category:Audio files of music', 'bei Gleichstand die erste Wurzel');

  const pages = fx('commonsaudio').sfx.query.pages;
  const cont = fx('commonsaudio').sfx.continue;
  const e1 = ca.nextEntry(st);
  st = ca.applyResponse(st, e1, pages, cont, { tiefe: 5 });
  assert.equal(st.seiten['Category:Audio files of music'], 1);
  assert.equal(ca.nextEntry(st).k, 'Category:Audio files of sound effects', 'die Wurzel mit weniger Anfragen kommt dran');
  const subs = st.warteschlange.filter((e) => e.d === 1).map((e) => e.k);
  assert.deepEqual(subs, ['Category:Files from Freesound.org', 'Category:Audio files of samples']);
  assert.ok(subs.every((k) => st.besucht[k]));
  const stay = st.warteschlange.find((e) => e.k === 'Category:Audio files of music');
  assert.deepEqual(stay.weiter, cont, 'der Eintrag bleibt mit continue in der Warteschlange');
  assert.equal(stay.a, 'musik');
  assert.ok(st.warteschlange.filter((e) => e.d === 1).every((e) => e.a === 'musik' && e.r === 'Category:Audio files of music'));

  // The same subcategories answered again are not queued twice.
  const again = ca.applyResponse(st, stay, pages, undefined, { tiefe: 5 });
  assert.equal(again.warteschlange.filter((e) => e.d === 1).length, 2);
  assert.ok(!again.warteschlange.some((e) => e.k === 'Category:Audio files of music'), 'Eintrag ohne continue verlässt die Warteschlange');

  // Depth limit and exclusions: categories are known (visited) but not queued.
  const flat = ca.applyResponse(ca.prepareState(null, roots.slice(0, 1), { heute: '2026-11-23' }), ca.nextEntry(ca.prepareState(null, roots.slice(0, 1), { heute: '2026-11-23' })), pages, undefined, { tiefe: 0 });
  assert.equal(flat.warteschlange.length, 0);
  assert.ok(flat.fertigAm);
  const ex = ca.applyResponse(ca.prepareState(null, roots.slice(0, 1), { heute: '2026-11-23' }), ca.nextEntry(ca.prepareState(null, roots.slice(0, 1), { heute: '2026-11-23' })), pages, undefined, { tiefe: 5, ausschluss: new Set(['Category:Files from Freesound.org']) });
  assert.deepEqual(ex.warteschlange.map((e) => e.k), ['Category:Audio files of samples']);
  const spoken = ca.applyResponse(ca.prepareState(null, roots.slice(0, 1), { heute: '2026-11-23' }), ca.nextEntry(ca.prepareState(null, roots.slice(0, 1), { heute: '2026-11-23' })), [{ ns: 14, title: 'Category:Lingua Libre pronunciation-deu' }, { ns: 14, title: 'Category:Piano' }], undefined, { tiefe: 5 });
  assert.deepEqual(spoken.warteschlange.map((e) => e.k), ['Category:Piano']);
});

test('Commons-Audio: neuer Durchlauf erst nach der Wartezeit, neue Wurzeln werden nachgetragen', () => {
  const roots = ca.rootsFromConfig({ musik: ['A'] });
  let st = ca.prepareState(null, roots, { heute: '2026-11-23' });
  st = ca.applyResponse(st, ca.nextEntry(st), [{ ns: 14, title: 'Category:B' }], undefined, { tiefe: 5 });
  st = ca.applyResponse(st, ca.nextEntry(st), [], undefined, { tiefe: 5, now: '2026-11-23T10:00:00Z' });
  assert.equal(st.warteschlange.length, 0);
  assert.equal(st.fertigAm, '2026-11-23');
  assert.equal(ca.prepareState(st, roots, { heute: '2026-11-23' }).warteschlange.length, 0, 'am selben Tag nicht noch einmal');
  assert.equal(ca.prepareState(st, roots, { heute: '2026-12-10', wiederholenNachTagen: 30 }).warteschlange.length, 0, 'vor Ablauf der Wartezeit nicht');
  const again = ca.prepareState(st, roots, { heute: '2026-12-23', wiederholenNachTagen: 30 });
  assert.equal(again.zyklus, 2);
  assert.equal(again.warteschlange.length, 1);
  assert.deepEqual(Object.keys(again.besucht), ['Category:A']);
  // A root added to the config later is queued even while the old walk is finished.
  const more = ca.prepareState(st, [...roots, { kat: 'Category:C', art: 'sound' }], { heute: '2026-11-23' });
  assert.deepEqual(more.warteschlange.map((e) => e.k), ['Category:C']);
  assert.equal(more.fertigAm, undefined);
});

test('Commons-Audio: crawl() läuft die Warteschlange ab und speichert den Stand', async () => {
  await inTemp(async (dir) => {
    const stand = join(dir, 'ca.json');
    const page = fx('commonsaudio').sfx;
    // Assertions live outside the answers: an exception inside fetch would be retried by the HTTP layer.
    const answers = [page, { query: { pages: [] } }, { batchcomplete: true, query: { pages: [] } }];
    const logs = [];
    let urls = [];
    const items = await withFetch(answers, async (calls) => {
      const r = await ca.default.crawl({ sounds: ['Audio files of sound effects'], budget: 3, stand, abstand: 0 }, (m) => logs.push(m));
      urls = calls.map((u) => new URL(u).searchParams);
      return r;
    });
    assert.equal(urls.length, 3);
    assert.equal(urls[0].get('gcmtitle'), 'Category:Audio files of sound effects');
    assert.equal(urls[0].get('gcmtype'), 'subcat|file');
    assert.equal(urls[1].get('gcmcontinue'), page.continue.gcmcontinue, 'zweite Anfrage führt das continue fort');
    assert.equal(urls[2].get('gcmtitle'), 'Category:Files from Freesound.org');
    assert.equal(items.length, 3, 'Comic, Beepalert und ERH; das Bild und die zwei Kategorien nicht');
    items.forEach(valid);
    assert.ok(items.every((i) => !JSON.stringify(i).includes('utm_')));
    const saved = JSON.parse(await readFile(stand, 'utf8'));
    assert.equal(saved.version, 1);
    assert.equal(saved.warteschlange.length, 1, 'eine Unterkategorie ist noch offen');
    assert.equal(saved.warteschlange[0].k, 'Category:Audio files of samples');
  });
});

test('Commons-Audio: Drosselung oder Fehler beenden den Lauf, der Stand bleibt unverändert', async () => {
  await inTemp(async (dir) => {
    const stand = join(dir, 'ca.json');
    const logs = [];
    const throttled = () => new Response('You are making too many requests. Please wait and try again.', { status: 200 });
    const items = await withFetch([throttled], () => ca.default.crawl({ musik: ['Musopen'], budget: 5, stand, abstand: 0 }, (m) => logs.push(m)));
    assert.deepEqual(items, []);
    assert.ok(logs.some((l) => /abgebrochen/.test(l)), logs.join('\n'));
    const saved = JSON.parse(await readFile(stand, 'utf8'));
    assert.equal(saved.warteschlange.length, 1);
    assert.equal(saved.warteschlange[0].weiter, null);
    assert.equal(saved.seiten['Category:Musopen'], 0);

    const lagged = { error: { code: 'maxlag', info: 'Waiting for a database server' } };
    await withFetch([lagged], () => ca.default.crawl({ musik: ['Musopen'], budget: 5, stand, abstand: 0 }, (m) => logs.push(m)));
    assert.equal(JSON.parse(await readFile(stand, 'utf8')).warteschlange.length, 1);

    const missing = { error: { code: 'missingcategory', info: 'x' } };
    await withFetch([missing], () => ca.default.crawl({ musik: ['Musopen'], budget: 5, stand, abstand: 0 }, () => {}));
    assert.equal(JSON.parse(await readFile(stand, 'utf8')).warteschlange.length, 0, 'eine nicht lesbare Kategorie verlässt die Warteschlange');
  });
});

// ---------------------------------------------------------------------------------------------
// Internet Archive

test('Internet Archive: Field Recording als Sound, ohne Beschreibung, Ort und Uploader', () => {
  const it = ia.parseItem(fx('internetarchive-audio').aporee, { kind: 'sound' });
  valid(it);
  assert.equal(it.id, 'internetarchive:aporee_1_2');
  assert.equal(it.kind, 'sound');
  assert.match(it.sig, /^SND·IA·/);
  assert.equal(it.license.id, 'CC-BY-SA-3.0');
  assert.equal(it.creator.name, 'udo noll');
  assert.equal(it.title, 'radio aporee - a pencil line');
  assert.equal(it.preview.url, 'https://archive.org/download/aporee_1_2/maps.mp3');
  assert.equal(it.downloads[1].url, 'https://archive.org/compress/aporee_1_2');
  assert.equal(it.meta.dauer, '40 s');
  assert.equal(it.meta.sammlung, 'radio-aporee-maps');
  assert.ok(it.tags.includes('field recording'));
  const text = JSON.stringify(it);
  assert.ok(!/aporee\.org|Bürkner|latitude|52\.49/.test(text), 'weder Uploader-Mail noch Ortsangabe');
});

test('Internet Archive: Album des Free-Music-Archive-Spiegels bleibt Musik, Standard der Art ist Musik', () => {
  const it = ia.parseItem(fx('internetarchive-audio').fma);
  valid(it);
  assert.equal(it.kind, 'musik');
  assert.equal(it.license.id, 'CC-BY-3.0');
  assert.equal(it.meta.titel, '3');
  assert.equal(it.meta.sammlung, 'freemusicarchive');
  assert.equal(it.preview.url, 'https://archive.org/download/Behaviour_state-10035/DEREK_PIOTR_-_02_-_Behavior_state.mp3');
});

test('Internet Archive: E-Mail-Adressen werden aus Name, Titel und Schlagwörtern entfernt', () => {
  assert.equal(ia.maskEmails('Jane Doe <jane@example.org>'), 'Jane Doe');
  assert.equal(ia.maskEmails('jane@example.org'), '');
  assert.equal(ia.maskEmails('Jane (jane.doe+x@mail.example.org), Jim'), 'Jane, Jim');
  assert.equal(ia.maskEmails('udo noll'), 'udo noll');
  const base = fx('internetarchive-audio').aporee;
  const m = { ...base.metadata, creator: 'radio@aporee.org', title: 'Aufnahme von me@example.org', subject: 'field recording;kontakt: me@example.org' };
  const it = ia.parseItem({ ...base, metadata: m }, { kind: 'sound' });
  valid(it);
  assert.equal(it.creator.name, 'unbekannt');
  assert.ok(!JSON.stringify(it).includes('@'), JSON.stringify(it));
  assert.equal(ia.parseItem({ ...base, metadata: { ...m, title: 'x@y.org' } }, { kind: 'sound' }).title, 'aporee_1_2');
});

test('Internet Archive: Suchanfrage nach addeddate, alte Aufrufform und Lizenzliste bleiben', () => {
  const old = decodeURIComponent(ia.searchUrl('netlabels', 10, 1));
  assert.match(old, /collection:"netlabels"/);
  assert.equal(new URL(ia.searchUrl('netlabels', 10, 1)).searchParams.get('sort[]'), 'downloads desc');
  assert.match(old, /rows=10&page=1/);
  const staged = decodeURIComponent(ia.searchUrl('radio-aporee-maps', 100, 3, { sort: 'addeddate asc' }));
  assert.equal(new URL(ia.searchUrl('radio-aporee-maps', 100, 3, { sort: 'addeddate asc' })).searchParams.get('sort[]'), 'addeddate asc');
  assert.match(staged, /page=3/);
  assert.equal((staged.match(/licenseurl:/g) ?? []).length, 12);
  assert.equal(ia.LICENSE_URLS.length, 12);
});

test('Internet Archive: Sammlungen und Budget aus der Konfiguration, alte und neue Form', () => {
  assert.deepEqual(ia.collectionsFromConfig({}), [{ id: 'netlabels', art: 'musik' }]);
  assert.deepEqual(ia.collectionsFromConfig({ sammlungen: ['netlabels', { id: 'radio-aporee-maps', art: 'sound' }, { id: 'netlabels', art: 'sound' }, { id: 'a b', art: 'musik' }, { id: 'x', art: 'video' }] }), [
    { id: 'netlabels', art: 'musik' },
    { id: 'radio-aporee-maps', art: 'sound' },
  ]);
  assert.equal(ia.budgetFromConfig({ budget: 120 }), 120);
  assert.equal(ia.budgetFromConfig({ limit: 400, maxSeiten: 8 }), 800);
  assert.equal(ia.budgetFromConfig({}), 400);
});

test('Internet Archive: Stand, Position mitten auf einer Seite, Fenster von 10 000 und zweiter Durchgang', () => {
  const cols = [{ id: 'a', art: 'musik' }, { id: 'b', art: 'sound' }];
  let st = ia.prepareState(null, cols, { heute: '2026-11-23' });
  assert.deepEqual(Object.keys(st.sammlungen), ['a', 'b']);
  assert.deepEqual(ia.position(0), { page: 1, skip: 0 });
  assert.deepEqual(ia.position(250), { page: 3, skip: 50 });
  assert.deepEqual(ia.position(9999), { page: 100, skip: 99 });
  st = ia.applyItems(st, 'a', 37);
  assert.equal(st.sammlungen.a.offset, 37);

  // Small collection: the end of the list finishes it.
  const small = ia.applyEnd(st, 'a', { treffer: 286, now: '2026-11-23T10:00:00Z' });
  assert.equal(small.sammlungen.a.fertig, true);
  assert.equal(small.sammlungen.a.treffer, 286);

  // Big collection: oldest window first, then the newest one, then done.
  let big = { ...st, sammlungen: { ...st.sammlungen, b: { ...st.sammlungen.b, offset: 10000, treffer: 58714 } } };
  big = ia.applyEnd(big, 'b', {});
  assert.equal(big.sammlungen.b.richtung, 'desc');
  assert.equal(big.sammlungen.b.offset, 0);
  assert.equal(big.sammlungen.b.fertig, false);
  big.sammlungen.b.offset = 10000;
  big = ia.applyEnd(big, 'b', { now: '2026-11-24T10:00:00Z' });
  assert.equal(big.sammlungen.b.fertig, true);
  assert.equal(big.sammlungen.b.fertigAm, '2026-11-24');

  // New round: not on the same day, not before the wait; small ones resume behind the old end, big ones reread the newest window.
  const done = { ...small, sammlungen: { ...small.sammlungen, b: big.sammlungen.b } };
  assert.equal(ia.prepareState(done, cols, { heute: '2026-11-24' }).sammlungen.b.fertig, true);
  assert.equal(ia.prepareState(done, cols, { heute: '2026-12-10', wiederholenNachTagen: 30 }).sammlungen.a.fertig, true);
  const next = ia.prepareState(done, cols, { heute: '2026-12-24', wiederholenNachTagen: 30 });
  assert.deepEqual([next.sammlungen.a.fertig, next.sammlungen.a.offset, next.sammlungen.a.richtung, next.sammlungen.a.runde], [false, 286, 'asc', 2]);
  assert.deepEqual([next.sammlungen.b.fertig, next.sammlungen.b.offset, next.sammlungen.b.richtung], [false, 0, 'desc']);
  // Changed kind of a collection starts it over.
  assert.equal(ia.prepareState(done, [{ id: 'a', art: 'sound' }], { heute: '2026-11-24' }).sammlungen.a.offset, 0);
});

const searchAnswer = (ids, numFound = 250) => ({ response: { numFound, start: 0, docs: ids.map((identifier) => ({ identifier, addeddate: '2013-01-01T00:00:00Z' })) } });

test('Internet Archive: crawl() sortiert aufsteigend, hält Budget und Offset und setzt mitten auf der Seite fort', async () => {
  await inTemp(async (dir) => {
    const stand = join(dir, 'ia.json');
    const data = fx('internetarchive-audio');
    const answer = (url) => {
      if (url.includes('advancedsearch')) return searchAnswer(['aporee_1_2', 'aporee_2_3', 'aporee_2_4']);
      const id = decodeURIComponent(url.split('/metadata/')[1]);
      return { ...data.aporee, metadata: { ...data.aporee.metadata, identifier: id } };
    };
    const logs = [];
    const cfg = { sammlungen: [{ id: 'radio-aporee-maps', art: 'sound' }], budget: 3, stand, abstand: 0 };
    let searchUrls = [];
    const first = await withFetch([answer], async (calls) => {
      const r = await ia.default.crawl(cfg, (m) => logs.push(m));
      searchUrls = calls.filter((u) => u.includes('advancedsearch')).map((u) => new URL(u).searchParams);
      return r;
    });
    assert.equal(searchUrls.length, 1);
    assert.equal(searchUrls[0].get('sort[]'), 'addeddate asc');
    assert.deepEqual(first.map((i) => i.id), ['internetarchive:aporee_1_2', 'internetarchive:aporee_2_3']);
    assert.ok(first.every((i) => i.kind === 'sound'));
    let saved = JSON.parse(await readFile(stand, 'utf8'));
    assert.equal(saved.sammlungen['radio-aporee-maps'].offset, 2, 'Budget endete nach zwei von drei Einträgen');
    assert.equal(saved.sammlungen['radio-aporee-maps'].fertig, false);

    const second = await withFetch([answer], () => ia.default.crawl({ ...cfg, budget: 4 }, () => {}));
    assert.deepEqual(second.map((i) => i.id), ['internetarchive:aporee_2_4'], 'ab dem dritten Eintrag, nichts doppelt');
    saved = JSON.parse(await readFile(stand, 'utf8'));
    assert.equal(saved.sammlungen['radio-aporee-maps'].offset, 3);
    assert.equal(saved.sammlungen['radio-aporee-maps'].fertig, true, 'kurze Seite = Ende der Liste');
    assert.equal(saved.sammlungen['radio-aporee-maps'].treffer, 250);
  });
});

test('Internet Archive: Fehler bei /metadata/ beendet den Lauf ohne den Offset zu bewegen, 404 wird übersprungen', async () => {
  await inTemp(async (dir) => {
    const stand = join(dir, 'ia.json');
    const data = fx('internetarchive-audio');
    const ok = (id) => ({ ...data.fma, metadata: { ...data.fma.metadata, identifier: id } });
    const answers = (failWith) => (url) => {
      if (url.includes('advancedsearch')) return searchAnswer(['x1', 'x2', 'x3']);
      const id = url.split('/metadata/')[1];
      if (id === 'x2') return new Response('', { status: failWith });
      return ok(id);
    };
    const cfg = { sammlungen: ['freemusicarchive'], budget: 20, stand, abstand: 0 };
    const logs = [];
    const items = await withFetch([answers(403)], () => ia.default.crawl(cfg, (m) => logs.push(m)));
    assert.deepEqual(items.map((i) => i.id), ['internetarchive:x1']);
    assert.ok(logs.some((l) => /abgebrochen/.test(l) && /x2/.test(l)), logs.join('\n'));
    let saved = JSON.parse(await readFile(stand, 'utf8'));
    assert.equal(saved.sammlungen.freemusicarchive.offset, 1, 'x2 wird beim nächsten Lauf wieder versucht');
    assert.ok(saved.sammlungen.freemusicarchive.fehler);

    const skipped = await withFetch([answers(404)], () => ia.default.crawl(cfg, () => {}));
    assert.deepEqual(skipped.map((i) => i.id), ['internetarchive:x3'], 'x2 fehlt auf dem Server und wird übersprungen');
    saved = JSON.parse(await readFile(stand, 'utf8'));
    assert.equal(saved.sammlungen.freemusicarchive.fertig, true);
    assert.equal(saved.sammlungen.freemusicarchive.fehler, undefined);
  });
});

test('Internet Archive: Suchfehler (z. B. 507 hinter dem Fenster) beendet den Lauf ohne Fortschritt', async () => {
  await inTemp(async (dir) => {
    const stand = join(dir, 'ia.json');
    const logs = [];
    const items = await withFetch([new Response('{"error":"DEEP_PAGING"}', { status: 400 })], () =>
      ia.default.crawl({ sammlungen: ['freemusicarchive'], budget: 5, stand, abstand: 0 }, (m) => logs.push(m)));
    assert.deepEqual(items, []);
    const saved = JSON.parse(await readFile(stand, 'utf8'));
    assert.equal(saved.sammlungen.freemusicarchive.offset, 0);
    assert.equal(saved.sammlungen.freemusicarchive.fertig, false);
  });
});
