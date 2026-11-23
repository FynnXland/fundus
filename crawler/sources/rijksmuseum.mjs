// Rijksmuseum through its OAI-PMH data service (checked 23.11.2026, data.rijksmuseum.nl/docs/oai-pmh):
// - The old key API (rijksmuseum.nl/api) is gone. data.rijksmuseum.nl/oai needs no key and returns Europeana Data
//   Model (EDM) records, 50 per page (about 390 KB), 848,910 museum objects in total. The Linked Art search only
//   returns ids (one request per object), so OAI-PMH is the bulk path. RIJKSMUSEUM_API_KEY is not needed.
// - Rights per object: edm:rights is the Public Domain Mark (48 of the first 50 records) or rightsstatements.org
//   "In Copyright" (2 of 50, those also carry a dc:rights holder line). Only PDM and CC0 URLs pass; anything else,
//   and any record that names a rights holder, is dropped. Policy 3.7 (data.rijksmuseum.nl/policy/information-and-data-policy):
//   public-domain works get PDM and/or CC0, works still in copyright are not published as open data.
// - Images: iiif.micr.io (IIIF Image API, Access-Control-Allow-Origin: *, 200 image/jpeg for bot and browser UA, no
//   referer check, `1600,` on a 1024 px image is clamped instead of failing). Its robots.txt ends with a managed
//   Cloudflare block (`Allow: /`, Content-Signal search=yes, ai-train=no) followed by `User-agent: * / Disallow: /`;
//   under RFC 9309 the two rules for the same agent cancel to "allowed", the museum itself offers the service for reuse
//   (docs/iiif/image) and every thumbnail is fetched once. The catalogue trains nothing. Risk is noted in the report.
// - Work is spread over days: data/crawlstand/rijksmuseum.json keeps the OAI resumption token. `cfg.budget` pages per run.
import { politeFetch, setHostGap } from '../lib/http.mjs';
import { makeItem, q } from '../lib/item.mjs';
import { advanceStrand, emptyStrand, loadJson, prepareStrand, saveJson } from './stand-helfer.mjs';

const OAI = 'https://data.rijksmuseum.nl/oai';
const HOST = 'data.rijksmuseum.nl';
const STATE_FILE = 'data/crawlstand/rijksmuseum.json';

const source = {
  id: 'rijksmuseum',
  code: 'C5',
  name: 'Rijksmuseum',
  url: 'https://data.rijksmuseum.nl/',
  kinds: ['bild'],
  terms: 'https://data.rijksmuseum.nl/policy/information-and-data-policy',
};

// edm:rights URL → licence code for makeItem. Nothing else passes.
const RIGHTS = {
  'http://creativecommons.org/publicdomain/mark/1.0/': 'pdm',
  'https://creativecommons.org/publicdomain/mark/1.0/': 'pdm',
  'http://creativecommons.org/publicdomain/zero/1.0/': 'cc0',
  'https://creativecommons.org/publicdomain/zero/1.0/': 'cc0',
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

// Text of the first <tag lang="…">…</tag>, preferring the given languages in order.
function langText(xml, tag, langs = ['en', 'nl']) {
  const found = [...xml.matchAll(new RegExp(`<${tag}(?:\\s+xml:lang="([\\w-]+)")?\\s*>([^<]*)</${tag}>`, 'g'))].map((m) => ({ lang: m[1], text: unescapeXml(m[2]).trim() })).filter((x) => x.text);
  for (const l of langs) {
    const hit = found.find((x) => x.lang === l);
    if (hit) return hit.text;
  }
  return found[0]?.text;
}

const attr = (xml, tag) => new RegExp(`<${tag}\\s+rdf:resource="([^"]*)"`).exec(xml)?.[1];

/** Splits an OAI response into the raw XML of its <record> elements. */
export function splitRecords(xml) {
  return [...String(xml).matchAll(/<record>[\s\S]*?<\/record>/g)].map((m) => m[0]);
}

/** Resumption token and total of an OAI response; `token` is null on the last page. */
export function resumption(xml) {
  const m = /<resumptionToken(?:\s[^>]*?completeListSize="(\d+)")?[^>]*>([^<]*)<\/resumptionToken>/.exec(String(xml));
  const token = m?.[2]?.trim();
  return { token: token || null, total: m?.[1] ? Number(m[1]) : undefined };
}

/** One EDM <record> → catalogue entry, or null unless it is an open-rights image record. */
export function parseRecord(xml) {
  if (!xml || /<header[^>]*status="deleted"/.test(xml)) return null;
  const rights = attr(xml, 'edm:rights');
  const license = RIGHTS[rights];
  if (!license) return null;
  // A rights holder line next to an open rights URL is contradictory: leave the object out.
  if (/<dc:rights[\s>]/.test(xml)) return null;
  if (!/<edm:type>IMAGE<\/edm:type>/.test(xml)) return null;

  const cho = attr(xml, 'edm:aggregatedCHO');
  const sourceId = cho?.match(/\/(\d+)$/)?.[1];
  const imageId = /https:\/\/iiif\.micr\.io\/([A-Za-z0-9_-]+)\/full\//.exec(attr(xml, 'edm:isShownBy') ?? '')?.[1];
  const landing = attr(xml, 'edm:isShownAt');
  if (!sourceId || !imageId || !landing) return null;
  try {
    if (new URL(landing).host !== 'www.rijksmuseum.nl') return null;
  } catch {
    return null;
  }

  const choXml = /<edm:ProvidedCHO[\s\S]*?<\/edm:ProvidedCHO>/.exec(xml)?.[0] ?? '';
  const title = langText(choXml, 'dc:title');
  if (!title) return null;
  const creatorRef = attr(choXml, 'dc:creator');
  let creatorName;
  if (creatorRef) {
    const agent = new RegExp(`<edm:Agent rdf:about="${creatorRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">[\\s\\S]*?</edm:Agent>`).exec(xml)?.[0];
    creatorName = agent && langText(agent, 'skos:prefLabel');
  }
  const description = langText(choXml, 'dc:description');
  const meta = {};
  const created = langText(choXml, 'dcterms:created');
  const extent = langText(choXml, 'dcterms:extent');
  const inventory = /<dc:identifier>([^<]*)<\/dc:identifier>/.exec(choXml)?.[1]?.trim();
  if (created) meta.entstanden = created;
  if (extent) meta.masse = extent;
  if (inventory) meta.inventarnummer = unescapeXml(inventory);

  const base = `https://iiif.micr.io/${imageId}/full`;
  return makeItem(source, {
    sourceId,
    kind: 'bild',
    title,
    description: description ? description.slice(0, 500) : undefined,
    creator: { name: creatorName || 'unbekannt' },
    landing,
    license,
    preview: { type: 'image', thumb: `${base}/400,/0/default.jpg`, url: `${base}/1600,/0/default.jpg` },
    downloads: [{ label: 'JPEG in voller Auflösung', url: `${base}/max/0/default.jpg`, format: 'jpg' }],
    meta: Object.keys(meta).length ? meta : undefined,
  });
}

export function listUrl(token) {
  return `${OAI}?${token ? q({ verb: 'ListRecords', resumptionToken: token }) : q({ verb: 'ListRecords', metadataPrefix: 'edm' })}`;
}

source.crawl = async function crawl(cfg = {}, log = () => {}) {
  setHostGap(HOST, Number(cfg.abstandMs) || 1500);
  const budget = Math.max(1, Number(cfg.budget) || 30);
  const heute = new Date().toISOString().slice(0, 10);
  const statePath = cfg.stand ?? STATE_FILE;
  const loaded = await loadJson(statePath, { version: 1, strang: emptyStrand() });
  let strand = prepareStrand(loaded.strang, { heute, nachTagen: cfg.wiederholenNachTagen });
  const out = [];
  let used = 0;
  let rejected = 0;
  let total;
  let stop = null;
  try {
    while (used < budget && !strand.fertig) {
      used++;
      let xml;
      try {
        const res = await politeFetch(listUrl(strand.weiter), { timeout: 90000, headers: { Accept: 'text/xml' } });
        xml = await res.text();
        if (!res.ok || /<error code="/.test(xml)) {
          // A token that no longer works restarts the listing next run instead of failing for ever.
          if (/badResumptionToken/.test(xml)) strand = emptyStrand();
          throw new Error(`HTTP ${res.status} ${(/<error[^>]*>([^<]*)/.exec(xml)?.[1] ?? '').slice(0, 120)}`);
        }
      } catch (err) {
        stop = err.message;
        break;
      }
      for (const rec of splitRecords(xml)) {
        const it = parseRecord(rec);
        if (it) out.push(it);
        else rejected++;
      }
      const next = resumption(xml);
      total = next.total ?? total;
      strand = advanceStrand(strand, next.token, heute);
    }
  } finally {
    await saveJson(statePath, { version: 1, strang: strand });
  }
  if (stop) log(`  rijksmuseum: Lauf abgebrochen (${stop})`);
  log(`  rijksmuseum: ${used}/${budget} Seiten, ${out.length} Objekte, ${rejected} verworfen${total ? `, ${total} insgesamt` : ''}, ${strand.fertig ? 'Zyklus fertig' : 'weiter mit gespeichertem Token'}`);
  return out;
};

export default source;
