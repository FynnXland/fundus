// National Gallery of Art (Washington) Open Data (checked 23.11.2026, github.com/NationalGalleryOfArt/opendata):
// - CSV dumps under raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data: published_images.csv (92 MB,
//   129,734 images, 69,504 with openaccess = 1) and objects.csv (83 MB, 146,456 objects). README: the data set is released
//   under CC0; "Images and media files are not included". The data dictionary defines `openaccess`: "1 = open access
//   image with no usage restrictions under the NGA open access policy, 0 = rights restricted image available only under
//   fair use". Only primary views with openaccess = 1 and no `maxpixels` limit pass (63,890 objects), mapped to CC0.
//   That mapping follows NGA's open access policy; the per-image CC0 wording is not in the CSV itself (see report).
// - Images: api.nga.gov/iiif/<uuid> (IIIF, Access-Control-Allow-Origin: *, 200 image/jpeg for bot and browser UA, no
//   referer check). robots.txt of api.nga.gov: "Crawl-delay: 10" and a note to contact NGA before crawling nga.gov; the
//   adapter itself only reads the two CSVs, but thumbnail runs against api.nga.gov must keep ten seconds between requests.
// - Landing: www.nga.gov/collection/art-object-page.<objectid>.html redirects (301) to /artworks/<id>-<slug>, 200 for
//   both user agents; /artworks/<id> alone is 404.
// - The CSVs are read once per run (about 14 s, 175 MB); `cfg.limit` entries are emitted per run in ascending object id,
//   data/crawlstand/nga.json remembers the last object id.
import { politeFetch, setHostGap } from '../lib/http.mjs';
import { makeItem } from '../lib/item.mjs';
import { advanceStrand, emptyStrand, loadJson, prepareStrand, saveJson } from './stand-helfer.mjs';

const RAW = 'https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/';
const STATE_FILE = 'data/crawlstand/nga.json';

const source = {
  id: 'nga',
  code: 'C4',
  name: 'National Gallery of Art',
  url: 'https://www.nga.gov/artworks/free-images-and-open-access',
  kinds: ['bild'],
  terms: 'https://github.com/NationalGalleryOfArt/opendata/blob/main/README.md',
};

/** RFC 4180 reader: commas and line breaks inside quotes stay in the field, "" is a quote. Yields arrays of strings. */
export function* csvRows(text) {
  const n = text.length;
  let row = [];
  let start = 0;
  let i = 0;
  let quoted = false;
  let field = null; // set once a quote forces piecewise assembly
  const end = (stop) => {
    row.push(field !== null ? field + text.slice(start, stop) : text.slice(start, stop));
    field = null;
  };
  while (i < n) {
    const c = text.charCodeAt(i);
    if (quoted) {
      if (c === 34) {
        if (text.charCodeAt(i + 1) === 34) {
          field = (field ?? '') + text.slice(start, i + 1);
          i += 2;
          start = i;
          continue;
        }
        quoted = false;
        field = (field ?? '') + text.slice(start, i);
        i++;
        start = i;
        continue;
      }
      i++;
      continue;
    }
    if (c === 34) {
      quoted = true;
      field = (field ?? '') + text.slice(start, i);
      i++;
      start = i;
      continue;
    }
    if (c === 44) {
      end(i);
      i++;
      start = i;
      continue;
    }
    if (c === 10 || c === 13) {
      end(i);
      yield row;
      row = [];
      if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
      i++;
      start = i;
      continue;
    }
    i++;
  }
  if (start < n || row.length || field !== null) {
    end(n);
    yield row;
  }
}

/** CSV text → array of objects keyed by the header row; blank lines are skipped. */
export function parseCsv(text) {
  let head = null;
  const out = [];
  for (const r of csvRows(String(text).replace(/^﻿/, ''))) {
    if (!head) {
      head = r;
      continue;
    }
    if (r.length === 1 && r[0] === '') continue;
    const o = {};
    for (let k = 0; k < head.length; k++) o[head[k]] = r[k] ?? '';
    out.push(o);
  }
  return out;
}

const IIIF = /^https:\/\/api\.nga\.gov\/iiif\/[0-9a-f-]{36}$/;

/**
 * Open-access primary image per object id from published_images rows. Rows with openaccess other than "1", a
 * `maxpixels` limit, a foreign IIIF host or no object id are ignored; the lowest `sequence` wins.
 * @returns {Map<string, object>}
 */
export function openImages(rows) {
  const best = new Map();
  for (const r of rows) {
    if (r.openaccess !== '1' || r.viewtype !== 'primary' || r.maxpixels) continue;
    if (!IIIF.test(r.iiifurl ?? '') || !/^\d+$/.test(r.depictstmsobjectid ?? '')) continue;
    const prev = best.get(r.depictstmsobjectid);
    if (!prev || Number(r.sequence) < Number(prev.sequence)) best.set(r.depictstmsobjectid, r);
  }
  return best;
}

/** One object row plus its open-access image row → catalogue entry, or null. */
export function parseObject(o, img) {
  if (!o || !img || img.openaccess !== '1' || img.maxpixels || !IIIF.test(img.iiifurl ?? '')) return null;
  if (!/^\d+$/.test(o.objectid ?? '') || o.objectid !== img.depictstmsobjectid) return null;
  const title = String(o.title ?? '').replace(/\s+/g, ' ').trim();
  if (!title) return null;
  const w = Number(img.width);
  const h = Number(img.height);
  const meta = {};
  if (o.displaydate) meta.entstanden = o.displaydate.trim();
  if (o.medium) meta.technik = o.medium.replace(/\s+/g, ' ').trim();
  if (w > 0 && h > 0) meta.abmessung = `${w} × ${h} px`;
  if (o.accessionnum) meta.inventarnummer = o.accessionnum.trim();
  const tags = [o.classification, o.subclassification].map((t) => String(t ?? '').trim().toLowerCase()).filter(Boolean);
  const alt = String(img.assistivetext ?? '').replace(/\s+/g, ' ').trim();
  return makeItem(source, {
    sourceId: o.objectid,
    kind: 'bild',
    title,
    description: alt ? alt.slice(0, 400) : undefined,
    tags: [...new Set(tags)],
    creator: { name: String(o.attribution ?? '').trim() || 'unbekannt' },
    landing: `https://www.nga.gov/collection/art-object-page.${o.objectid}.html`,
    license: 'cc0',
    preview: { type: 'image', thumb: `${img.iiifurl}/full/!400,400/0/default.jpg`, url: `${img.iiifurl}/full/!1024,1024/0/default.jpg` },
    downloads: [
      { label: 'JPEG bis 2048 px', url: `${img.iiifurl}/full/!2048,2048/0/default.jpg`, format: 'jpg' },
      { label: 'JPEG in voller Auflösung', url: `${img.iiifurl}/full/full/0/default.jpg`, format: 'jpg' },
    ],
    meta: Object.keys(meta).length ? meta : undefined,
  });
}

/**
 * Next batch: entries with object id above `after`, ascending, at most `limit`.
 * @returns {{ items: object[], last: number|null, done: boolean }}  done = nothing left after this batch
 */
export function nextBatch(objects, images, after, limit) {
  const ordered = objects
    .filter((o) => images.has(o.objectid) && Number(o.objectid) > after)
    .sort((a, b) => Number(a.objectid) - Number(b.objectid));
  const slice = ordered.slice(0, limit);
  const items = [];
  for (const o of slice) {
    const it = parseObject(o, images.get(o.objectid));
    if (it) items.push(it);
  }
  const last = slice.length ? Number(slice[slice.length - 1].objectid) : null;
  return { items, last, done: ordered.length <= limit };
}

source.crawl = async function crawl(cfg = {}, log = () => {}) {
  setHostGap('raw.githubusercontent.com', 1000);
  const limit = Math.max(1, Number(cfg.limit) || 5000);
  const heute = new Date().toISOString().slice(0, 10);
  const statePath = cfg.stand ?? STATE_FILE;
  const loaded = await loadJson(statePath, { version: 1, strang: emptyStrand() });
  let strand = prepareStrand(loaded.strang, { heute, nachTagen: cfg.wiederholenNachTagen });
  if (strand.fertig) {
    log('  nga: Zyklus fertig, nächster Durchlauf nach der Wartezeit');
    return [];
  }
  const fetchText = async (name) => {
    const res = await politeFetch(`${RAW}${name}`, { timeout: 180000, headers: { Accept: 'text/csv,text/plain' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} bei ${name}`);
    return res.text();
  };
  let items = [];
  try {
    const images = openImages(parseCsv(await fetchText('published_images.csv')));
    const objects = parseCsv(await fetchText('objects.csv'));
    const batch = nextBatch(objects, images, Number(strand.weiter) || 0, limit);
    items = batch.items;
    strand = advanceStrand(strand, batch.done ? null : batch.last, heute);
    log(`  nga: ${items.length} Werke (${images.size} offene Bilder, ${objects.length} Objekte), ${strand.fertig ? 'Zyklus fertig' : `weiter ab Objekt ${strand.weiter}`}`);
  } catch (err) {
    log(`  nga: Lauf abgebrochen (${err.message})`);
  }
  await saveJson(statePath, { version: 1, strang: strand });
  return items;
};

export default source;
