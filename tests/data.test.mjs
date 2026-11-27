// Checks the real catalogue under data/katalog/, if there is one: every entry valid, licence on the
// whitelist, no NC/ND, unique ids, only http(s) links. Call numbers are display labels and may repeat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { validateItem } from '../crawler/lib/schema.mjs';
import { ladeKatalog } from '../crawler/lib/store.mjs';

const ordner = new URL('../data/katalog/', import.meta.url);

test('Katalogdaten sind gültig', { skip: !existsSync(ordner) && 'data/katalog/ fehlt (noch nicht gecrawlt)' }, async () => {
  const { items } = await ladeKatalog();
  assert.ok(items.length > 0, 'Katalog ist leer');
  const fehler = [];
  const ids = new Set();
  for (const it of items) {
    const e = validateItem(it);
    if (e.length) fehler.push(`${it.id}: ${e.join(', ')}`);
    if (ids.has(it.id)) fehler.push(`doppelte id ${it.id}`);
    ids.add(it.id);
    if (/(^|-)N[CD](-|$)/.test(it.license.id)) fehler.push(`${it.id}: Lizenz ${it.license.id}`);
  }
  assert.deepEqual(fehler.slice(0, 20), []);
});
