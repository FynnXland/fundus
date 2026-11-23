// Checks the real catalogue under data/katalog/, if there is one: every entry valid, licence on the
// whitelist, no NC/ND, unique ids, only http(s) links. Call numbers are display labels and may repeat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { validateItem } from '../crawler/lib/schema.mjs';

const ordner = new URL('../data/katalog/', import.meta.url);

test('Katalogdaten sind gültig', { skip: !existsSync(ordner) && 'data/katalog/ fehlt (noch nicht gecrawlt)' }, () => {
  const items = readdirSync(ordner).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(readFileSync(new URL(f, ordner), 'utf8')).items);
  assert.ok(items.length > 0, 'Katalog ist leer');
  const fehler = [];
  const ids = new Set();
  for (const it of items) {
    const e = validateItem(it);
    if (e.length) fehler.push(`${it.id}: ${e.join(', ')}`);
    if (ids.has(it.id)) fehler.push(`doppelte id ${it.id}`);
    ids.add(it.id);
    if (/NC|ND/.test(it.license.id)) fehler.push(`${it.id}: Lizenz ${it.license.id}`);
  }
  assert.deepEqual(fehler.slice(0, 20), []);
});
