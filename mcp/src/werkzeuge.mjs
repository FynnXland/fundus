// The MCP tools, shared by the local server (stdio.mjs) and the remote one (worker.mjs). Answers are one compact
// text block each (no structuredContent: clients would hand both to the model and double the tokens).
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { FundusFehler, LIZENZGRUPPEN, VERSION, groesse, namensnennung, dateienVon, ohneTracking } from './kern.mjs';
import { kontaktbogen, base64 } from './kontaktbogen.mjs';

const anleitung = (bogen) => `Fundus is a catalogue of free assets (pictures, 3D models, materials, HDRIs, icons, music, sounds, fonts, scripts, projects, Claude skills, videos). Files stay at their original source; Fundus lists them with license and attribution.
Cheap workflow: fundus_catalog once for kinds and subfolders -> fundus_search (compact rows, paged by cursor; narrow with kind, subfolder, language, license_group, min_popularity; sort "popular" for the best known) -> fundus_preview ${bogen ? 'with several ids as one contact sheet' : 'for up to 6 ids'} (look before downloading, especially 3D) -> fundus_details for license, attribution, download options and, for code, links to the README and file list -> download. fundus_similar finds alternatives to an entry, fundus_attribution writes the credits for everything you used. Subfolder names, kinds and data are partly German; pass them as shown. Always keep the attribution text with files that require it.`;

const zeichen = (s, n) => {
  const t = String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fehler = (err) => {
  if (err instanceof FundusFehler || err?.name === 'ZodError') return { isError: true, content: [{ type: 'text', text: err.message }] };
  throw err;
};

/** "4.6/5 (120 votes)" for a rated entry, else "155837 GitHub-Sterne", else "-". */
function beliebtheitSpalte(r) {
  if (Array.isArray(r.bew)) return `${r.bew[0]}/5 (${r.bew[1]} votes)`;
  if (Array.isArray(r.pop)) return `${r.pop[0]} ${r.pop[1]}`;
  return '-';
}

function vorschauSpalte(r) {
  if (r.vorschau) return 'yes';
  if (r.fremd) return 'source';
  return '-';
}

/** Rows as a tab table; with a fallback a last column "missing" names the query words a row lacks. */
export function suchzeilen(treffer, { rueckfall = false } = {}) {
  // a column for stars, downloads or ratings only when a row on the page has one (pictures and icons have none)
  const mitZahl = treffer.some((r) => r.bew || r.pop);
  const kopf = `id\ttitle\tkind/subfolder\tlicense\tformats\tsource\tcreator\tpreview${mitZahl ? '\tpopularity' : ''}${rueckfall ? '\tmissing' : ''}`;
  const zeilen = treffer.map((r) =>
    [r.id, `${zeichen(r.titel, 70)}${gruppenMarke(r)}`, `${r.art}/${r.unter}`, r.lizenz, r.formate.split(' ').slice(0, 5).join(' '), r.quellname, zeichen(r.urheber, 30), vorschauSpalte(r), ...(mitZahl ? [beliebtheitSpalte(r)] : []), ...(rueckfall ? [r.fehlt ?? '-'] : [])].join('\t'),
  );
  return [kopf, ...zeilen].join('\n');
}

/** A member of a group in a folded page: the row is its example, the mark names the group, its size and the hits here. */
const gruppenMarke = (r) => (r.serie && r.hier ? ` [group ${r.serie}: ${r.serieAnzahl} entries${r.hier > 1 ? `, ${r.hier} here` : ''}]` : '');

function suchkopf(e, { q, art, limit }) {
  const was = `${e.gruppe ? ` in group ${e.gruppe.id} "${e.gruppe.name}"${e.gruppe.urheber ? ` by ${e.gruppe.urheber}` : ''}` : ''}${q ? ` for "${q}"` : ''}${art && !e.gruppe ? ` in ${art}` : ''}`;
  const zeige = e.ab ? `showing ${e.ab}-${e.bis ?? e.ab + e.treffer.length - 1}${e.gefaltet ? ` in ${e.treffer.length} rows` : ''}` : `${e.treffer.length} on this page`;
  const teile = [];
  if (e.rueckfall && e.gesamt == null) {
    // row filters: counts before them say nothing about this page
    const voll = e.treffer.filter((r) => !r.fehlt).length;
    teile.push(`${voll ? `${voll} on this page match all words of "${q}", then` : `No entry on this page matches all words of "${q}" with these filters; showing`} entries matching only some words (column "missing").`);
  } else if (e.rueckfall) {
    const teil = `${e.gesamt - e.voll} `;
    const von = `of "${q}"${art ? ` in ${art}` : ''}`;
    teile.push(e.voll
      ? `${e.voll} ${e.voll === 1 ? 'match' : 'matches'} for all words ${von}, then ${teil}matching only some words (column "missing"), ${zeige}.`
      : `No entry matches all words ${von}. Showing ${teil}entries matching some words, most words first (column "missing" = words the entry lacks), ${zeige}.`);
  } else if (!e.treffer.length) teile.push(`No matches${was}${e.weiter ? ' in the part searched so far' : ''}.`);
  else if (e.gesamt != null) teile.push(`${e.gesamt} matches${was}, ${zeige}.`);
  else teile.push(`${e.treffer.length} matches${was} on this page (total not counted with these filters).`);
  if (e.treffer.some((r) => r.serie && r.hier)) teile.push('A row marked [group …] is one example for a group of related entries (series, set, one designer); pass group to list them.');
  if (e.beliebt) teile.push('Sorted by popularity (stars, downloads, ratings), most popular first.');
  // an incomplete search proves nothing (MCP feedback 28.11.2026: "blue sky clouds" stopped after 12 index files and
  // the agent could not tell "nothing there" from "not searched deep enough")
  if (e.teilweise) teile.push(`The search is not complete: it stopped after ${e.abrufe} index files to stay cheap, so ${e.treffer.length ? 'more matches may exist' : 'no match so far does not mean Fundus has none'}. Continue with cursor "${e.weiter}", or narrow it with kind (and subfolder) so fewer files are needed.`);
  else if (e.weiter) teile.push(`More: cursor "${e.weiter}".`);
  if (!e.treffer.length && !e.weiter && limit) teile.push('The whole index was searched: nothing matches. Words are matched literally (word starts, plurals, small typos) and most titles are English, so German compounds rarely match ("Blumenstillleben": try "flower still life"). Try another word, fewer filters or fundus_catalog for valid filter values.');
  return teile.join(' ');
}

export function detailtext(it, { mitUrls = true } = {}) {
  const l = it.license;
  const pflicht = !l.attribution ? 'attribution not required (still good practice)' : l.shareAlike ? 'attribution required, share-alike for adaptations' : 'attribution required';
  const zeilen = [
    `${it.title}  [${it.id}]`,
    `Kind: ${it.kind}/${it.unter}${it.tags?.length ? ` · Tags: ${zeichen(it.tags.slice(0, 8).join(', '), 160)}` : ''}`,
    `Creator: ${it.creator?.name ?? 'unknown'}${it.creator?.url ? ` (${it.creator.url})` : ''}`,
    `License: ${l.name}${l.url ? ` ${l.url}` : ''} · ${pflicht}`,
    `Attribution: ${namensnennung(it)}`,
    `Source page: ${ohneTracking(it.source.url)} (${it.source.name})`,
  ];
  zeilen.push(`Use: commercial use and adaptation are allowed (Fundus lists no NC or ND licenses)${l.attribution ? '; name creator and license' : ''}${l.shareAlike ? '; pass adaptations on under the same license (share-alike or copyleft)' : ''}. The license text decides.`);
  if (it.description) zeilen.push(`Description: ${zeichen(it.description, 300)}`);
  const m = it.meta ?? {};
  // size, polygons and textures before the download (Poly Haven models carry them): an agent furnishing a room should
  // not download ten models only to measure them (MCP feedback 28.11.2026)
  if (m.abmessung) zeilen.push(`Size: ${m.abmessung.replace(/,/g, '.').replace('(B × T × H)', '(width × depth × height, as given by the source)').replace('(B × T × H. aus der Datei gemessen)', '(width × depth × height, measured by Fundus from the model file: rough, and only as right as the scale of the model)')}`);
  const fakten = [
    it.popularity ? `${it.popularity.value} ${it.popularity.label}` : '',
    m.polygone ? `${m.polygone} polygons` : '',
    m.aufloesung ? `textures up to ${m.aufloesung}` : '',
    m.material ? `material ${m.material}` : '',
    m.zustand ? `condition ${m.zustand}` : '',
    m.dauer ? `duration ${m.dauer}` : '',
    m.sprache ? `language ${m.sprache}` : '',
    m.zuletzt ? `last change at the source ${m.zuletzt}` : '',
  ].filter(Boolean);
  if (fakten.length) zeilen.push(`Facts: ${fakten.join(' · ')}`);
  // Fundus relays no files: for code the reader gets the addresses and fetches them itself
  const repo = it.source.id === 'github' ? it.meta?.repository ?? it.meta?.sammlung : null;
  if (repo) zeilen.push(`Read the source yourself: README https://raw.githubusercontent.com/${repo}/HEAD/README.md (other file name: https://api.github.com/repos/${repo}/readme) · file list https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1 · a file https://raw.githubusercontent.com/${repo}/HEAD/<path>`);
  if (it.collection?.name) zeilen.push(`Collection: ${it.collection.name}`);
  if (['projekt', 'skript', 'skill'].includes(it.kind)) zeilen.push('Note: third-party code. Fundus does not check security, privacy compliance or whether the license claim is right; review it before use.');
  if (it.serie?.id) zeilen.push(`Group: ${it.serie.name} (${it.serie.anzahl} entries), list them with fundus_search group "${it.serie.id}"`);
  zeilen.push(`Preview: ${it.vorschau ? 'own thumbnail (fundus_preview)' : it.preview?.thumb ? `only at the source: ${ohneTracking(it.preview.thumb)}` : 'none'}${it.preview?.type === 'audio' && it.preview.url ? ` · audio sample: ${ohneTracking(it.preview.url)}` : ''}`);
  zeilen.push('Downloads (number = download option):');
  it.downloads.forEach((d, i) => {
    const dateien = d.paket?.files?.length;
    const teile = [d.label, d.format ? (dateien ? `${dateien} files` : d.format) : dateien ? `${dateien} files` : '', groesse(d.paket?.size ?? d.size)].filter(Boolean);
    zeilen.push(`  ${i + 1}. ${teile.join(' · ')}${mitUrls && !dateien ? ` · ${ohneTracking(d.url)}` : ''}`);
  });
  return zeilen.join('\n');
}

function katalogtext(stand, artName) {
  const ix = stand.index;
  if (artName) {
    const a = ix.arten.find((x) => x.art === artName);
    if (!a) throw new FundusFehler(`Unknown kind "${artName}". Kinds: ${ix.arten.map((x) => x.art).join(', ')}`);
    const pu = stand.perUnter?.[artName] ?? {};
    const unter = a.unter.map((u) => `${u} (${pu[u] ?? '?'})`).join(', ');
    const quellen = stand.sources.filter((s) => s.kinds?.includes(artName) && s.count).map((s) => `${s.id} (${s.name})`).join(', ');
    return `${artName}: ${a.anzahl} entries.\nSubfolders: ${unter}\nSources offering this kind: ${quellen}`;
  }
  const arten = ix.arten.map((a) => `${a.art} ${a.anzahl}`).join(', ');
  const quellen = stand.sources.filter((s) => s.count).map((s) => `${s.id}=${s.name} ${s.count}`).join(', ');
  const formate = Object.entries(stand.perFormat ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([f]) => f).join(' ');
  const gruppen = Object.entries(LIZENZGRUPPEN).map(([g, t]) => `${g} = ${t}`).join('; ');
  return [
    `Fundus catalogue: ${stand.total} entries, data from ${String(stand.crawledAt ?? '').slice(0, 10)}.`,
    `Kinds: ${arten}`,
    `License groups (license_group): ${gruppen}`,
    `Sources (id=name count): ${quellen}`,
    `Common formats: ${formate}`,
    'Subfolders of a kind: fundus_catalog with kind.',
  ].join('\n');
}

const NUR_LESEN = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/**
 * kern: erstelleKern(). codec: WebP codec for contact sheets or null (then single previews only).
 * herunterladen: async ({ it, nr, ziel, maxMb, ueberschreiben }) -> text, only in the local server.
 * quellbild: async (url) -> { bytes, mime } | null, fetches a thumbnail at the source (local server only).
 */
export function baueServer({ kern, codec = null, herunterladen = null, quellbild = null, name = 'fundus' }) {
  const server = new McpServer({ name, version: VERSION }, { instructions: anleitung(Boolean(codec)) });

  server.registerTool(
    'fundus_catalog',
    {
      title: 'Fundus: catalogue overview',
      description: 'Lists what the Fundus catalogue holds: kinds with counts, license groups, sources and common formats. With kind: the subfolders of that kind with counts. Use it to find valid filter values for fundus_search.',
      inputSchema: z.object({ kind: z.string().optional().describe('e.g. "3d", "musik", "textur"; omit for the overview') }),
      annotations: NUR_LESEN,
    },
    async ({ kind }) => {
      try { return text(katalogtext(await kern.info(), kind)); } catch (err) { return fehler(err); }
    },
  );

  server.registerTool(
    'fundus_search',
    {
      title: 'Fundus: search assets',
      description: 'Searches the Fundus catalogue of free assets and returns compact tab-separated rows (id, title, kind/subfolder, license, formats, source, creator, preview = own thumbnail yes/source/-). Query words are matched in title, tags, subfolder, kind name, creator, formats and description (word starts, plurals, small typos); title hits rank first and well-known entries (stars, downloads) are lifted. A column popularity shows stars, downloads or rating where an entry has them. Entries matching all words come first; if fewer than 3 do, entries matching most words follow, with a last column "missing" naming the words they lack. All filters are optional and combine; without query it lists a kind or subfolder. Related entries (a numbered series, an icon set, one designer at game-icons) come as one example row marked [group id: size]; pass group to list the members. Paged: pass the returned cursor for the next page. Next steps: fundus_preview (look), fundus_details (license, downloads).',
      inputSchema: z.object({
        query: z.string().optional().describe('search words, e.g. "wooden chair"; English and German titles exist'),
        kind: z.string().optional().describe('bild, grafik, 3d, textur, hdri, icon, musik, sound, schrift, skript, projekt, skill, video. Libraries, engines and apps (three.js, Godot) are projekt; skript holds small single scripts'),
        subfolder: z.string().optional().describe('subfolder of the kind, exactly as in fundus_catalog, e.g. "Möbel"'),
        tags: z.array(z.string()).optional().describe('every tag must match the entry tags'),
        license: z.string().optional().describe('exact license name, e.g. "CC0 1.0", "CC BY 4.0", "MIT"'),
        license_group: z.enum(['frei', 'nennung', 'gleich']).optional().describe('frei = no attribution needed, nennung = attribution, gleich = share-alike/copyleft'),
        format: z.string().optional().describe('file format, e.g. glb, gltf, blend, fbx, stl, png, svg, mp3, wav, ogg, woff2, exr, hdr'),
        source: z.string().optional().describe('source id or name, e.g. polyhaven, ambientcg, wikimedia'),
        has_preview: z.boolean().optional().describe('only entries with an own thumbnail (fundus_preview works for them)'),
        language: z.string().optional().describe('programming language of a repository, e.g. "Rust", "Python", "C++", "TypeScript" (projekt, skript)'),
        min_popularity: z.number().int().min(1).optional().describe('only entries with at least this many stars or downloads (column popularity)'),
        since: z.string().optional().describe('only entries added to the catalogue on or after this date, YYYY-MM-DD'),
        sort: z.enum(['relevance', 'popular']).optional().describe('relevance (default: word match, lifted by popularity) or popular (most stars/downloads first; without query it needs kind and lists the best known of the kind or subfolder)'),
        limit: z.number().int().min(1).max(50).optional().describe('rows per page, default 10'),
        group: z.string().optional().describe('group id from a [group …] mark, e.g. "3d.4f2a9c1e": lists the members of that group'),
        cursor: z.string().optional().describe('from the previous answer'),
      }),
      annotations: NUR_LESEN,
    },
    async (a) => {
      try {
        const e = await kern.suchen({ q: a.query, art: a.kind, unter: a.subfolder, tags: a.tags, lizenz: a.license, lizenzgruppe: a.license_group, format: a.format, quelle: a.source, mitVorschau: a.has_preview, gruppe: a.group, limit: a.limit ?? 10, cursor: a.cursor, sortierung: a.sort, minBeliebt: a.min_popularity, seit: a.since, sprache: a.language });
        const kopf = suchkopf(e, { q: a.query, art: a.kind, limit: a.limit ?? 10 });
        return text(e.treffer.length ? `${kopf}\n${suchzeilen(e.treffer, { rueckfall: e.rueckfall })}` : kopf);
      } catch (err) { return fehler(err); }
    },
  );

  server.registerTool(
    'fundus_preview',
    {
      title: 'Fundus: look at previews',
      description: `Shows the own small preview pictures of catalogue entries, so you can judge them before downloading (3D models appear as a rendered still). layout "sheet" (default for several ids) puts all previews numbered on one picture with small cells: about ${Math.round((160 * 120) / 750)} image tokens per entry at cell_width 160, versus about ${Math.round((320 * 240) / 750)} for a single full preview. Only entries with preview "yes" in fundus_search have an own preview.${quellbild ? ' from_source also fetches the thumbnail at the original source for entries without own preview (direct request from this computer to the source).' : ' For entries without own preview the answer names the source thumbnail URL.'}`,
      inputSchema: z.object({
        ids: z.array(z.string()).min(1).max(16).describe('entry ids from fundus_search'),
        layout: z.enum(['sheet', 'single']).optional().describe('sheet = one numbered contact sheet (cheap), single = one full 320 px picture per id (max 6)'),
        cell_width: z.number().int().min(64).max(320).optional().describe('sheet cell width in px, default 160'),
        ...(quellbild ? { from_source: z.boolean().optional().describe('also fetch source thumbnails for entries without own preview') } : {}),
      }),
      annotations: { ...NUR_LESEN, openWorldHint: Boolean(quellbild) },
    },
    async ({ ids, layout, cell_width: zelle, from_source: vonQuelle }) => {
      try {
        ids = [...new Set(ids)];
        const bogen = codec && (layout ?? (ids.length > 1 ? 'sheet' : 'single')) === 'sheet';
        if (!bogen && ids.length > 6) throw new FundusFehler(codec ? 'layout "single" takes at most 6 ids; use layout "sheet" for more' : 'this server sends single previews only (no contact sheets): at most 6 ids per call');
        const bilder = await Promise.all(ids.map(async (id) => ({ id, bytes: await kern.vorschauBild(id) })));
        const mit = bilder.filter((b) => b.bytes);
        const ohne = bilder.filter((b) => !b.bytes);
        const zeilen = [];
        const inhalt = [];
        const titel = async (id) => { const r = await kern.zeileFuer(id); return r ? ` ${zeichen(r.titel, 60)}` : ''; };
        if (mit.length) {
          if (bogen) {
            const sheet = await kontaktbogen(codec, mit.map((b, i) => ({ nr: i + 1, bytes: b.bytes })), { zelle: zelle ?? 160 });
            zeilen.push(`Contact sheet ${sheet.breite}x${sheet.hoehe}, numbered left to right, top to bottom:`);
            for (const [i, b] of mit.entries()) zeilen.push(`${i + 1} = ${b.id}${await titel(b.id)}`);
            inhalt.push({ type: 'image', data: base64(sheet.bytes), mimeType: 'image/webp' });
          } else {
            zeilen.push('Previews in this order:');
            for (const [i, b] of mit.entries()) {
              zeilen.push(`${i + 1} = ${b.id}${await titel(b.id)}`);
              inhalt.push({ type: 'image', data: base64(b.bytes), mimeType: 'image/webp' });
            }
          }
        }
        for (const b of ohne) {
          let url = '';
          try {
            // a row seen in a search already says whether there is a source thumbnail; else one shard
            const r = await kern.zeileFuer(b.id);
            if (r) url = r.fremd ?? '';
            else { const it = await kern.eintrag(b.id); url = ohneTracking(it.preview?.thumb ?? ''); }
          } catch (err) {
            if (!(err instanceof FundusFehler)) throw err;
            zeilen.push(`${b.id}: ${err.message}`);
            continue;
          }
          if (vonQuelle && quellbild && url) {
            const q = await quellbild(url).catch(() => null);
            if (q) {
              zeilen.push(`${b.id}: thumbnail from the source (next picture after the ones above): ${url}`);
              inhalt.push({ type: 'image', data: base64(q.bytes), mimeType: q.mime });
              continue;
            }
          }
          zeilen.push(`${b.id}: no own preview${url ? `; source thumbnail: ${url}` : ''}`);
        }
        return { content: [{ type: 'text', text: zeilen.join('\n') }, ...inhalt] };
      } catch (err) { return fehler(err); }
    },
  );

  server.registerTool(
    'fundus_details',
    {
      title: 'Fundus: entry details',
      description: 'Full details of up to 5 entries: creator, license with link, ready-made attribution text, source page, description, facts the source gives (for many 3D models: size in metres, polygons, texture resolution, material) and the download options with format, size and direct link (packages list their file count). Use before downloading.',
      inputSchema: z.object({ ids: z.array(z.string()).min(1).max(5).describe('entry ids from fundus_search') }),
      annotations: NUR_LESEN,
    },
    async ({ ids }) => {
      try {
        const teile = [];
        for (const id of [...new Set(ids)]) {
          try { teile.push(detailtext(await kern.eintrag(id))); } catch (err) { if (err instanceof FundusFehler) teile.push(err.message); else throw err; }
        }
        return text(teile.join('\n\n'));
      } catch (err) { return fehler(err); }
    },
  );

  server.registerTool(
    'fundus_similar',
    {
      title: 'Fundus: similar entries',
      description: 'Alternatives to one entry: entries of the same kind and subfolder that share the most tags, the better known first. Same compact rows as fundus_search. Use it when a hit is close but not right, or to offer a choice.',
      inputSchema: z.object({
        id: z.string().describe('entry id from fundus_search'),
        limit: z.number().int().min(1).max(20).optional().describe('rows, default 8'),
      }),
      annotations: NUR_LESEN,
    },
    async ({ id, limit }) => {
      try {
        const rows = await kern.aehnliche(id, limit ?? 8);
        return text(rows.length ? `${rows.length} entries similar to ${id}:\n${suchzeilen(rows)}` : `No similar entries found for ${id}; try fundus_search with its tags.`);
      } catch (err) { return fehler(err); }
    },
  );

  server.registerTool(
    'fundus_attribution',
    {
      title: 'Fundus: credits for a list of entries',
      description: 'The ready-made attribution line for each of up to 10 entries, as one block to paste into credits, a README or a video description. Says for each whether the license requires it. Use it at the end, for everything that went into the work.',
      inputSchema: z.object({ ids: z.array(z.string()).min(1).max(10).describe('ids of the entries that were used') }),
      annotations: NUR_LESEN,
    },
    async ({ ids }) => {
      try {
        const pflicht = [];
        const frei = [];
        const fehlend = [];
        for (const id of [...new Set(ids)]) {
          try {
            const it = await kern.eintrag(id);
            (it.license.attribution ? pflicht : frei).push(namensnennung(it));
          } catch (err) { if (err instanceof FundusFehler) fehlend.push(err.message); else throw err; }
        }
        const teile = [];
        if (pflicht.length) teile.push(`Attribution required by the license (${pflicht.length}):\n${pflicht.join('\n')}`);
        if (frei.length) teile.push(`No attribution required, naming the source is still good practice (${frei.length}):\n${frei.join('\n')}`);
        if (fehlend.length) teile.push(fehlend.join('\n'));
        return text(teile.join('\n\n'));
      } catch (err) { return fehler(err); }
    },
  );

  if (herunterladen) {
    server.registerTool(
      'fundus_download',
      {
        title: 'Fundus: download to a folder',
        description: 'Downloads one download option of an entry directly from its original source into a folder on this computer (packages keep their folder structure) and writes the license and attribution as a .lizenz.txt file next to it. Check the size with fundus_details first; downloads above max_mb are refused. Existing files are kept unless overwrite is true.',
        inputSchema: z.object({
          id: z.string().describe('entry id'),
          download: z.number().int().min(1).optional().describe('download option number from fundus_details, default 1'),
          target_dir: z.string().optional().describe('absolute path of the folder to save into; default from FUNDUS_ZIEL or ~/Downloads/Fundus'),
          max_mb: z.number().positive().optional().describe('size limit in MB, default 500'),
          overwrite: z.boolean().optional(),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async ({ id, download, target_dir: ziel, max_mb: maxMb, overwrite }) => {
        try {
          const it = await kern.eintrag(id);
          return text(await herunterladen({ it, nr: download ?? 1, ziel, maxMb: maxMb ?? 500, ueberschreiben: Boolean(overwrite) }));
        } catch (err) { return fehler(err); }
      },
    );
  } else {
    server.registerTool(
      'fundus_download_links',
      {
        title: 'Fundus: direct download links',
        description: 'Direct links to the files of a download option at the original source (Fundus hosts no files), with the attribution text to keep next to them. Pass id for one entry or ids for up to 10 at once (one option number for all, default 1). Packages (e.g. glTF with textures) list every file with its relative path; save them in that structure. A package file may sit in a folder of another resolution at the source (Poly Haven shares one .bin across resolutions); that is expected.',
        inputSchema: z.object({
          id: z.string().optional().describe('entry id (or use ids)'),
          ids: z.array(z.string()).min(1).max(10).optional().describe('up to 10 entry ids, like fundus_details takes them'),
          download: z.number().int().min(1).optional().describe('download option number from fundus_details, default 1 (the same for all ids)'),
        }),
        annotations: NUR_LESEN,
      },
      async ({ id, ids, download }) => {
        try {
          const alle = [...new Set([...(id ? [id] : []), ...(ids ?? [])])];
          if (!alle.length) throw new FundusFehler('pass id (one entry) or ids (up to 10 entries)');
          if (alle.length > 10) throw new FundusFehler('at most 10 entries per call');
          const nr = download ?? 1;
          const bloecke = [];
          let fehlgeschlagen = 0;
          for (const eid of alle) {
            try { bloecke.push(await linkBlock(eid, nr)); } catch (err) { if (!(err instanceof FundusFehler)) throw err; bloecke.push(err.message); fehlgeschlagen++; }
          }
          // nothing usable at all is an error (as before for a single id); a partly good batch is an answer
          if (fehlgeschlagen === alle.length) throw new FundusFehler(bloecke.join('\n'));
          return text(bloecke.join('\n\n'));
        } catch (err) { return fehler(err); }
      },
    );
    // one entry's links; a missing option is that entry's problem, not the whole call's
    async function linkBlock(id, nr) {
      const it = await kern.eintrag(id);
      const d = it.downloads[nr - 1];
      if (!d) throw new FundusFehler(`${id} has ${it.downloads.length} download option(s); option ${nr} does not exist`);
      const dateien = dateienVon(d);
      const zeilen = [
        `${it.title} [${it.id}], option ${nr}: ${d.label}${groesse(d.paket?.size ?? d.size) ? `, ${groesse(d.paket?.size ?? d.size)}` : ''}`,
        `License: ${it.license.name}${it.license.url ? ` ${it.license.url}` : ''}`,
        `Attribution (save as a text file next to the files): ${namensnennung(it)}`,
      ];
      if (d.paket) {
        zeilen.push(`Package "${d.paket.name}", ${dateien.length} files (relative path<TAB>url):`);
        for (const f of dateien) zeilen.push(`${f.pfad}\t${f.url}`);
      } else zeilen.push(`File: ${dateien[0].url}`);
      return zeilen.join('\n');
    }
  }

  return server;
}
