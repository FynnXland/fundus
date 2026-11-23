// The MCP tools, shared by the local server (stdio.mjs) and the remote one (worker.mjs). Answers are one compact
// text block each (no structuredContent: clients would hand both to the model and double the tokens).
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { FundusFehler, LIZENZGRUPPEN, VERSION, groesse, namensnennung, dateienVon, ohneTracking } from './kern.mjs';
import { kontaktbogen, base64 } from './kontaktbogen.mjs';

const ANLEITUNG = `Fundus is a catalogue of free assets (pictures, 3D models, materials, HDRIs, icons, music, sounds, fonts, scripts, projects, Claude skills, videos). Files stay at their original source; Fundus lists them with license and attribution.
Cheap workflow: fundus_search (compact rows, paged by cursor) -> fundus_preview with several ids as one contact sheet (look before downloading, especially 3D) -> fundus_details for license, attribution and download options -> download. Subfolder names, kinds and data are partly German; pass them as shown. Always keep the attribution text with files that require it.`;

const zeichen = (s, n) => {
  const t = String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fehler = (err) => {
  if (err instanceof FundusFehler || err?.name === 'ZodError') return { isError: true, content: [{ type: 'text', text: err.message }] };
  throw err;
};

function vorschauSpalte(r) {
  if (r.vorschau) return 'yes';
  if (r.fremd) return 'source';
  return '-';
}

export function suchzeilen(treffer) {
  const kopf = 'id\ttitle\tkind/subfolder\tlicense\tformats\tsource\tcreator\tpreview';
  const zeilen = treffer.map((r) =>
    [r.id, zeichen(r.titel, 70), `${r.art}/${r.unter}`, r.lizenz, r.formate.split(' ').slice(0, 5).join(' '), r.quellname, zeichen(r.urheber, 30), vorschauSpalte(r)].join('\t'),
  );
  return [kopf, ...zeilen].join('\n');
}

function suchkopf(e, { q, art, limit }) {
  const was = `${q ? ` for "${q}"` : ''}${art ? ` in ${art}` : ''}`;
  const teile = [];
  if (!e.treffer.length) teile.push(`No matches${was}${e.weiter ? ' in the part searched so far' : ''}.`);
  else if (e.gesamt != null) teile.push(`${e.gesamt} matches${was}, ${e.ab ? `showing ${e.ab}-${e.ab + e.treffer.length - 1}` : `${e.treffer.length} on this page`}.`);
  else teile.push(`${e.treffer.length} matches${was} on this page (total not counted with these filters).`);
  if (e.teilweise) teile.push(`Stopped after ${e.abrufe} index files to stay cheap; continue with cursor "${e.weiter}" or narrow the search (kind, query).`);
  else if (e.weiter) teile.push(`More: cursor "${e.weiter}".`);
  if (!e.treffer.length && !e.weiter && limit) teile.push('Try fewer words, another kind or fundus_catalog for valid filter values.');
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
  if (it.description) zeilen.push(`Description: ${zeichen(it.description, 300)}`);
  if (it.collection?.name) zeilen.push(`Collection: ${it.collection.name}`);
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
  const server = new McpServer({ name, version: VERSION }, { instructions: ANLEITUNG });

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
      description: 'Searches the Fundus catalogue of free assets and returns compact tab-separated rows (id, title, kind/subfolder, license, formats, source, creator, preview = own thumbnail yes/source/-). Query words must all match (title, tags, creator, formats). All filters are optional and combine; without query it lists a kind or subfolder. Paged: pass the returned cursor for the next page. Next steps: fundus_preview (look), fundus_details (license, downloads).',
      inputSchema: z.object({
        query: z.string().optional().describe('search words, e.g. "wooden chair"; English and German titles exist'),
        kind: z.string().optional().describe('bild, grafik, 3d, textur, hdri, icon, musik, sound, schrift, skript, projekt, skill, video'),
        subfolder: z.string().optional().describe('subfolder of the kind, exactly as in fundus_catalog, e.g. "Möbel"'),
        tags: z.array(z.string()).optional().describe('every tag must match the entry tags'),
        license: z.string().optional().describe('exact license name, e.g. "CC0 1.0", "CC BY 4.0", "MIT"'),
        license_group: z.enum(['frei', 'nennung', 'gleich']).optional().describe('frei = no attribution needed, nennung = attribution, gleich = share-alike/copyleft'),
        format: z.string().optional().describe('file format, e.g. glb, gltf, blend, fbx, stl, png, svg, mp3, wav, ogg, woff2, exr, hdr'),
        source: z.string().optional().describe('source id or name, e.g. polyhaven, ambientcg, wikimedia'),
        has_preview: z.boolean().optional().describe('only entries with an own thumbnail (fundus_preview works for them)'),
        limit: z.number().int().min(1).max(50).optional().describe('rows per page, default 10'),
        cursor: z.string().optional().describe('from the previous answer'),
      }),
      annotations: NUR_LESEN,
    },
    async (a) => {
      try {
        const e = await kern.suchen({ q: a.query, art: a.kind, unter: a.subfolder, tags: a.tags, lizenz: a.license, lizenzgruppe: a.license_group, format: a.format, quelle: a.source, mitVorschau: a.has_preview, limit: a.limit ?? 10, cursor: a.cursor });
        const kopf = suchkopf(e, { q: a.query, art: a.kind, limit: a.limit ?? 10 });
        return text(e.treffer.length ? `${kopf}\n${suchzeilen(e.treffer)}` : kopf);
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
      description: 'Full details of up to 5 entries: creator, license with link, ready-made attribution text, source page, description and the download options with format, size and direct link (packages list their file count). Use before downloading.',
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
        description: 'Direct links to the files of one download option at the original source (Fundus hosts no files), with the attribution text to keep next to them. Packages (e.g. glTF with textures) list every file with its relative path; save them in that structure.',
        inputSchema: z.object({
          id: z.string().describe('entry id'),
          download: z.number().int().min(1).optional().describe('download option number from fundus_details, default 1'),
        }),
        annotations: NUR_LESEN,
      },
      async ({ id, download }) => {
        try {
          const it = await kern.eintrag(id);
          const nr = download ?? 1;
          const d = it.downloads[nr - 1];
          if (!d) throw new FundusFehler(`${id} has ${it.downloads.length} download option(s)`);
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
          return text(zeilen.join('\n'));
        } catch (err) { return fehler(err); }
      },
    );
  }

  return server;
}
