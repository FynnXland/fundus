// Hand-picked GitHub fonts (no network): licence gate, release files as downloads, preview file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateItem } from '../crawler/lib/schema.mjs';
import { parseSchrift } from '../crawler/sources/githubschriften.mjs';

const repo = (extra = {}) => ({
  full_name: 'IdreesInc/Monocraft', name: 'Monocraft', description: 'A monospaced programming font', default_branch: 'main',
  html_url: 'https://github.com/IdreesInc/Monocraft', stargazers_count: 11496, license: { spdx_id: 'OFL-1.1' },
  owner: { login: 'IdreesInc', html_url: 'https://github.com/IdreesInc' }, ...extra,
});
const asset = (name, size) => ({ name, size, browser_download_url: `https://github.com/IdreesInc/Monocraft/releases/download/v4.2.1/${name}` });
const release = { tag_name: 'v4.2.1', assets: [asset('Monocraft-nerd-fonts-patched.ttc', 32076972), asset('Monocraft-ttf.zip', 1236744), asset('Monocraft.ttc', 5909252), asset('notes.txt', 10)] };

test('GitHub-Schriften: OFL-Schrift mit Release-Dateien, Nerd-Font-Variante zuletzt', () => {
  const it = parseSchrift(repo(), release, { urheber: 'Idrees Hassan', vorschau: 'dist/Monocraft-otf/Monocraft.otf', tags: ['Minecraft-Stil'] });
  assert.deepEqual(validateItem(it), []);
  assert.equal(it.id, 'githubschriften:idreesinc/monocraft');
  assert.equal(it.kind, 'schrift');
  assert.equal(it.license.id, 'OFL-1.1');
  assert.equal(it.creator.name, 'Idrees Hassan');
  assert.equal(it.preview.url, 'https://raw.githubusercontent.com/IdreesInc/Monocraft/main/dist/Monocraft-otf/Monocraft.otf');
  assert.deepEqual(it.downloads.map((d) => d.format), ['zip', 'ttc', 'ttc']);
  assert.match(it.downloads.at(-1).label, /nerd/);
  assert.equal(it.popularity.value, 11496);
});

test('GitHub-Schriften: ohne Vorschaupfad dient die erste TTF-Datei als Muster', () => {
  const it = parseSchrift(repo({ full_name: 'IdreesInc/Miracode', name: 'Miracode' }), { tag_name: 'v1.0', assets: [asset('Miracode.ttf', 298920)] });
  assert.match(it.preview.url, /Miracode\.ttf$/);
});

test('GitHub-Schriften: andere Lizenz oder keine Schriftdatei fällt raus', () => {
  assert.equal(parseSchrift(repo({ license: { spdx_id: 'MIT' } }), release, { vorschau: 'a.otf' }), null);
  assert.equal(parseSchrift(repo(), { assets: [asset('Monocraft-ttf.zip', 1)] }), null);
});
