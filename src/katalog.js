// Catalogue data in the browser. The index is split by kind and loaded on demand:
//   stand.json + start.json   at once (counts and a mixed sample for the first screen)
//   index/<art>.json          when a folder is opened
//   all index files           when a search or a filter spans every folder
//   karten/<xx>.json          one shard per opened detail sheet
import MiniSearch from 'minisearch';

export const ARTEN = {
  bild: { label: 'Bilder', einzahl: 'Bild' },
  grafik: { label: '2D-Grafik & Sprites', einzahl: '2D-Grafik' },
  '3d': { label: '3D-Modelle', einzahl: '3D-Modell' },
  textur: { label: 'Materialien', einzahl: 'Material' },
  hdri: { label: 'Umgebungen & Licht', einzahl: 'Umgebung' },
  icon: { label: 'Icons & UI', einzahl: 'Icon-Set' },
  musik: { label: 'Musik', einzahl: 'Musikstück' },
  sound: { label: 'Sounds', einzahl: 'Sound' },
  schrift: { label: 'Schriften', einzahl: 'Schrift' },
  skript: { label: 'Skripte & Add-ons', einzahl: 'Skript' },
  projekt: { label: 'Projekte', einzahl: 'Projekt' },
  skill: { label: 'Claude-Skills', einzahl: 'Claude-Skill' },
};

export const LIZENZGRUPPEN = {
  alle: 'Alle offenen Lizenzen',
  frei: 'Ohne Namensnennung',
  nennung: 'Mit Namensnennung',
  gleich: 'Gleiche Bedingungen (SA, GPL)',
};

export const SORTIERUNGEN = {
  gemischt: 'Gemischt',
  neu: 'Neueste zuerst',
  name: 'Name A bis Z',
  quelle: 'Nach Quelle',
};

async function holeJson(pfad) {
  const res = await fetch(pfad);
  if (!res.ok) throw new Error(`Katalogdaten nicht erreichbar (${pfad}: HTTP ${res.status})`);
  return res.json();
}

const alsObjekte = ({ felder, zeilen }) => zeilen.map((z) => Object.fromEntries(felder.map((f, i) => [f, z[i]])));
const mix = (a, b) => (a.sig.slice(-5) < b.sig.slice(-5) ? -1 : 1);

/** Loads counts and the start sample. Folders follow through ladeArt / ladeAlle. */
export async function ladeKatalog() {
  const [stand, start] = await Promise.all([holeJson('/data/stand.json'), holeJson('/data/start.json')]);
  const index = new MiniSearch({
    fields: ['titel', 'tags', 'urheber', 'quellname', 'unter', 'formate'],
    storeFields: [],
    searchOptions: { boost: { titel: 3, tags: 2, unter: 2 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' },
  });
  return { stand, start: alsObjekte(start), proArt: new Map(), laeuft: new Map(), byId: new Map(), index, alle: null };
}

export function ladeArt(k, art) {
  if (k.proArt.has(art)) return Promise.resolve(k.proArt.get(art));
  if (!k.stand.perKind?.[art]) { k.proArt.set(art, []); return Promise.resolve([]); }
  if (!k.laeuft.has(art)) {
    k.laeuft.set(
      art,
      holeJson(`/data/index/${art}.json`)
        .then((d) => {
          const liste = alsObjekte(d);
          for (const o of liste) k.byId.set(o.id, o);
          k.index.addAll(liste);
          k.proArt.set(art, liste);
          return liste;
        })
        .finally(() => k.laeuft.delete(art)),
    );
  }
  return k.laeuft.get(art);
}

export async function ladeAlle(k) {
  if (k.alle) return k.alle;
  await Promise.all(Object.keys(ARTEN).map((art) => ladeArt(k, art)));
  k.alle = [...k.proArt.values()].flat().sort(mix);
  return k.alle;
}

/** What a filter needs before it can be shown: 'start', one kind, or 'alle'. */
export function bedarf(f, wurzelAlle = false) {
  if (f.art) return f.art;
  if (f.q?.trim() || (f.lizenz && f.lizenz !== 'alle') || f.format || f.quelle || (f.sort && f.sort !== 'gemischt') || wurzelAlle) return 'alle';
  return 'start';
}
export const hat = (k, was) => (was === 'start' ? true : was === 'alle' ? Boolean(k.alle) : k.proArt.has(was));
export const hole = (k, was) => (was === 'start' ? Promise.resolve() : was === 'alle' ? ladeAlle(k) : ladeArt(k, was));

const vergleiche = {
  neu: (a, b) => (a.neu < b.neu ? 1 : a.neu > b.neu ? -1 : 0),
  name: (a, b) => a.titel.localeCompare(b.titel, 'de'),
  quelle: (a, b) => a.quellname.localeCompare(b.quellname, 'de') || a.titel.localeCompare(b.titel, 'de'),
};

/** Filters what is loaded; call hole() first. Returns { liste, auswahl } where auswahl marks the start sample. */
export function filtern(k, { q, art, unter, lizenz, format, quelle, sort }, wurzelAlle = false) {
  const was = bedarf({ q, art, lizenz, format, quelle, sort }, wurzelAlle);
  let liste;
  if (q?.trim()) liste = k.index.search(q.trim()).map((r) => k.byId.get(r.id)).filter(Boolean);
  else if (art) liste = k.proArt.get(art) ?? [];
  else liste = was === 'alle' ? k.alle ?? [] : k.start;
  if (art && q?.trim()) liste = liste.filter((o) => o.art === art);
  if (art && unter) liste = liste.filter((o) => o.unter === unter);
  if (lizenz && lizenz !== 'alle') liste = liste.filter((o) => o.gruppe === lizenz);
  if (format) liste = liste.filter((o) => o.formate.split(' ').includes(format));
  if (quelle) liste = liste.filter((o) => o.quelle === quelle);
  if (vergleiche[sort]) liste = [...liste].sort(vergleiche[sort]);
  return { liste, auswahl: was === 'start' };
}

const shards = new Map();
export async function ladeKarte(id) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(id)));
  const s = hash[0].toString(16).padStart(2, '0');
  if (!shards.has(s)) shards.set(s, holeJson(`/data/karten/${s}.json`));
  try {
    return (await shards.get(s))[id] ?? null;
  } catch (err) {
    shards.delete(s);
    throw err;
  }
}

/** Similar entries: same kind and subcategory, ranked by shared tags. The kind must be loaded. */
export function aehnliche(k, o, n = 8) {
  const tags = new Set(o.tags.split(' ').filter(Boolean));
  return (k.proArt.get(o.art) ?? [])
    .filter((x) => x.id !== o.id && x.unter === o.unter)
    .map((x) => ({ x, p: x.tags.split(' ').filter((t) => tags.has(t)).length + (x.vorschau ? 0.5 : 0) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, n)
    .map((e) => e.x);
}

/** More from the same collection, or by the same creator at the same source (within the loaded kind). */
export function mehrAusSammlung(k, o, n = 8) {
  const gleich = o.sammlung ? (x) => x.sammlung === o.sammlung : (x) => x.urheber === o.urheber && x.quelle === o.quelle && o.urheber !== 'unbekannt';
  return (k.proArt.get(o.art) ?? []).filter((x) => x.id !== o.id && gleich(x)).slice(0, n);
}
