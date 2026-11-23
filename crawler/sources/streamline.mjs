// Streamline Free (webalys-hq/streamline-vectors): about 30,000 free SVG icons in many styles, CC BY 4.0, one file each
// with a stable raw address. Checked 23.11.2026.
// - Licence: README of the repository and of every family folder: "Creative commons license: Attribution 4.0
//   International (CC BY 4.0) ... Attribution: You must give appropriate credit and provide a link to the Streamline
//   website (http://streamlinehq.com). Redistribution: Redistribution is encouraged as long as you follow the license
//   terms". The credit link is `creator.url`. Only the free icons are CC BY; GitHub's licence field is empty, so the licence
//   is set here. The licence page streamlinehq.com/free/license answered 429 to the bot, the READMEs carry the text.
// - Not taken: the family "logos" and every file with "logo" in its path (brand logos under a blanket CC BY claim of a third party: trademark and copyright
//   of the brands stay with the brands), "memes", "nasty-icons", "covid", and all monochrome styles (line, solid, remix:
//   Iconify has them as sets). The list of styles is an allowlist (STILE below), everything else is ignored.
// - Volume: 120 icons per style by default (cfg.jeStil), picked by a hash of the path (stable when files are added upstream, so the
//   catalogue does not grow with every crawl); "pixel" and "freebies-freemojis" bring 250 each. About 2,700 entries. The file list is one recursive
//   tree request (about 8 MB, 31,600 entries, not truncated on 23.11.2026).
import { makeItem } from '../lib/item.mjs';
import { blobUrl, githubFiles, stabileAuswahl, rawUrl, titelAusDatei } from './icons-helfer.mjs';

const REPO = 'webalys-hq/streamline-vectors';
const REF = 'main';

const source = {
  id: 'streamline',
  code: 'SL',
  name: 'Streamline Free',
  url: 'https://github.com/webalys-hq/streamline-vectors',
  kinds: ['icon'],
  terms: 'https://github.com/webalys-hq/streamline-vectors/blob/main/README.md',
};

// stil = proposed subfolder (docs/stand/fundus-icons.md), serie = style name shown on the card
export const STILE = [
  { pfad: 'core/flat', serie: 'Core Flat', stil: 'Farbig' },
  { pfad: 'core/gradient', serie: 'Core Gradient', stil: 'Farbig' },
  { pfad: 'core/pop', serie: 'Core Pop', stil: 'Farbig' },
  { pfad: 'core/neon', serie: 'Core Neon', stil: 'Farbig' },
  { pfad: 'core/duo', serie: 'Core Duo', stil: 'Farbig' },
  { pfad: 'flex/flat', serie: 'Flex Flat', stil: 'Farbig' },
  { pfad: 'flex/gradient', serie: 'Flex Gradient', stil: 'Farbig' },
  { pfad: 'flex/pop', serie: 'Flex Pop', stil: 'Farbig' },
  { pfad: 'flex/neon', serie: 'Flex Neon', stil: 'Farbig' },
  { pfad: 'plump/flat', serie: 'Plump Flat', stil: 'Farbig' },
  { pfad: 'plump/gradient', serie: 'Plump Gradient', stil: 'Farbig' },
  { pfad: 'plump/pop', serie: 'Plump Pop', stil: 'Farbig' },
  { pfad: 'sharp/flat', serie: 'Sharp Flat', stil: 'Farbig' },
  { pfad: 'sharp/gradient', serie: 'Sharp Gradient', stil: 'Farbig' },
  { pfad: 'sharp/pop', serie: 'Sharp Pop', stil: 'Farbig' },
  { pfad: 'ultimate/colors', serie: 'Ultimate Colors', stil: 'Farbig' },
  { pfad: 'freehand/duotone', serie: 'Freehand Duotone', stil: 'Illustrationen' },
  { pfad: 'kameleon/colors', serie: 'Kameleon', stil: 'Illustrationen' },
  { pfad: 'stickies/colors', serie: 'Stickies', stil: 'Illustrationen' },
  { pfad: 'pixel', serie: 'Pixel', stil: 'Pixel', max: 250 },
  { pfad: 'freebies-freemojis', serie: 'Freemojis', stil: 'Emoji', max: 250 },
];

// Brand logos are left out (trademarks, docs/RECHT.md): a path segment or file name part "logo"/"logos" (not "logout")
const MARKE = /(^|[/-])logos?([/-]|$)/i;
// Brand icons that are not named "logo" (all in the category computer-devices or the payment pixel icons). A word list cannot be
// complete; what slips through is removed by the block list (data/gesperrt.json) after a report.
const MARKENNAME = /(^|\/)(spotify|facebook|instagram|twitter|google|amazon|netflix|slack|mastercard|visa|paypal|youtube|tiktok|whatsapp|linkedin|pinterest|github|gitlab|figma|dropbox|skype|snapchat|reddit|twitch|discord|telegram|vimeo|airbnb|uber|tumblr|wordpress|chrome|firefox|safari|opera|windows|microsoft|dribbble|behance|soundcloud|bing|messenger|medium|stripe|shopify|zoom|trello|jira|apple-pay|apple-music)(-[a-z]*)*-?\d*$/i;
const MARKENORT = /computer-devices\/apple(-\d+)?$|money-payments\/[a-z-]*-(mastercard|visa|paypal|stripe)$/i;

const markenzeichen = (pfad) => {
  const p = pfad.replace(/\.svg$/, '');
  return MARKE.test(p) || MARKENNAME.test(p.split('/').at(-1)) || MARKENORT.test(p);
};

const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

export function parseStreamline(files, cfg = {}, now) {
  const stile = cfg.stile ?? STILE;
  const standard = cfg.jeStil ?? 120;
  const svgs = files.filter((f) => f.path.endsWith('.svg') && !markenzeichen(f.path)).sort((a, b) => a.path.localeCompare(b.path));
  const out = [];
  for (const s of stile) {
    const treffer = stabileAuswahl(svgs.filter((f) => f.path.startsWith(`${s.pfad}/`)), s.max ?? standard);
    for (const f of treffer) {
      const teile = f.path.replace(/\.svg$/, '').split('/');
      const datei = teile.at(-1);
      // pixel/<category>/x and freebies-freemojis/<category>/x have one level less than core/flat/<category>/x
      const bereich = teile.slice(s.pfad.split('/').length, -1).join(' ').replace(/-/g, ' ');
      const it = makeItem(source, {
        sourceId: teile.join('/'),
        kind: 'icon',
        title: titelAusDatei(datei),
        tags: [s.stil.toLowerCase(), 'farbig', 'streamline', s.serie.toLowerCase(), bereich, ...datei.split('-').filter((w) => !/^\d+$/.test(w))],
        creator: { name: 'Streamline', url: 'https://streamlinehq.com' },
        landing: blobUrl(REPO, REF, f.path),
        license: 'CC-BY-4.0',
        collection: { id: `streamline-${slug(s.pfad)}`, name: `Streamline ${s.serie}`, url: `https://github.com/${REPO}/tree/${REF}/${s.pfad}` },
        preview: { type: 'image', thumb: rawUrl(REPO, REF, f.path) },
        downloads: [{ label: 'SVG', url: rawUrl(REPO, REF, f.path), format: 'svg' }],
        meta: { stil: s.stil, serie: s.serie, ...(bereich ? { bereich } : {}) },
      }, now);
      if (it) out.push(it);
    }
  }
  return out;
}

source.crawl = async function crawl(cfg, log) {
  let files;
  try {
    files = await githubFiles(REPO, REF, { rekursiv: true });
  } catch (err) {
    log(`  streamline: ${err.message}`);
    return [];
  }
  const out = parseStreamline(files, cfg);
  log(`  streamline: ${out.length} Einträge aus ${files.filter((f) => f.path.endsWith('.svg')).length} Dateien`);
  return out.slice(0, cfg.limit ?? Infinity);
};

export default source;
