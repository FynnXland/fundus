import { normalizeLicense, attributionText } from './licenses.mjs';
import { callNumber, tidy, validateItem } from './schema.mjs';

/**
 * Turns the raw fields an adapter collected into a catalogue entry, or null if the licence is not
 * on the whitelist or a required field is missing. Adapters never build the final shape themselves.
 */
export function makeItem(source, raw, now = new Date().toISOString()) {
  const license = raw.license && typeof raw.license === 'object' ? raw.license : normalizeLicense(raw.license, raw.licenseVersion);
  if (!license) return null;
  const id = `${source.id}:${raw.sourceId}`;
  const item = tidy({
    id,
    sig: callNumber(raw.kind, source.code, id),
    kind: raw.kind,
    title: raw.title,
    description: raw.description,
    tags: raw.tags ?? [],
    creator: raw.creator ?? { name: 'unbekannt' },
    source: { id: source.id, name: raw.originName ?? source.name, url: raw.landing },
    via: raw.via,
    license,
    preview: raw.preview,
    downloads: (raw.downloads ?? []).filter((d) => d && d.url),
    meta: raw.meta,
    hashes: raw.hashes,
    collection: raw.collection,
    fetchedAt: now,
  });
  item.attribution = attributionText({ title: item.title, creator: item.creator, sourceUrl: item.source.url, license });
  for (const k of Object.keys(item)) if (item[k] === undefined) delete item[k];
  return validateItem(item).length ? null : item;
}

export function q(params) {
  return new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null)).toString();
}
