import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLicense, attributionText } from '../crawler/lib/licenses.mjs';

test('Openverse-Kürzel mit Version', () => {
  assert.equal(normalizeLicense('by', '2.0').id, 'CC-BY-2.0');
  assert.equal(normalizeLicense('by-sa', '4.0').id, 'CC-BY-SA-4.0');
  assert.equal(normalizeLicense('cc0').id, 'CC0-1.0');
  assert.equal(normalizeLicense('pdm').id, 'PDM-1.0');
});

test('Wikimedia-Kurznamen und CC-URLs', () => {
  assert.equal(normalizeLicense('CC BY-SA 3.0').id, 'CC-BY-SA-3.0');
  assert.equal(normalizeLicense('https://creativecommons.org/licenses/by/4.0').id, 'CC-BY-4.0');
  assert.equal(normalizeLicense('http://creativecommons.org/publicdomain/zero/1.0/deed.en').id, 'CC0-1.0');
  assert.equal(normalizeLicense('Public domain').id, 'PD');
});

test('NC und ND fliegen raus, in jeder Schreibweise', () => {
  for (const raw of ['by-nc', 'by-nc-sa', 'by-nd', 'CC BY-NC 4.0', 'CC BY-NC-ND 3.0', 'https://creativecommons.org/licenses/by-nc/4.0/', 'Attribution-NonCommercial']) {
    assert.equal(normalizeLicense(raw), null, raw);
  }
});

test('SPDX-Kennungen von GitHub', () => {
  assert.equal(normalizeLicense('MIT').id, 'MIT');
  assert.equal(normalizeLicense('GPL-3.0-or-later').id, 'GPL-3.0');
  assert.equal(normalizeLicense('apache-2.0').id, 'Apache-2.0');
  assert.equal(normalizeLicense('OFL-1.1').family, 'schrift');
  assert.equal(normalizeLicense('NOASSERTION'), null);
  assert.equal(normalizeLicense('other'), null);
  assert.equal(normalizeLicense(null), null);
});

test('Flags: Namensnennung und Share-Alike', () => {
  assert.equal(normalizeLicense('cc0').attribution, false);
  assert.equal(normalizeLicense('by').attribution, true);
  assert.equal(normalizeLicense('by-sa').shareAlike, true);
  assert.equal(normalizeLicense('GPL-3.0').shareAlike, true);
  assert.equal(normalizeLicense('MIT').shareAlike, false);
});

test('Namensnennung im TASL-Format', () => {
  const license = normalizeLicense('by', '4.0');
  const t = attributionText({ title: 'Regen', creator: { name: 'Ana' }, sourceUrl: 'https://example.org/regen', license });
  assert.equal(t, '„Regen“ von Ana, https://example.org/regen, Lizenz: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/deed.de)');
  const frei = attributionText({ title: 'Holz', creator: { name: 'ambientCG' }, sourceUrl: 'https://ambientcg.com/a/Wood099', license: normalizeLicense('cc0') });
  assert.match(frei, /Namensnennung nicht erforderlich/);
});

test('OGA-BY wie CC BY: Namensnennung, kein Share-Alike, Version bleibt', () => {
  const vier = normalizeLicense('OGA-BY 4.0');
  assert.equal(vier.id, 'OGA-BY-4.0');
  assert.equal(vier.attribution, true);
  assert.equal(vier.shareAlike, false);
  assert.equal(normalizeLicense('oga-by-3.0').id, 'OGA-BY-3.0');
  assert.equal(normalizeLicense('OGA-BY').id, 'OGA-BY-4.0');
  assert.equal(normalizeLicense('OGA-BY 2.0'), null);
});
