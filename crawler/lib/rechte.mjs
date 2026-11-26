// Rights check for music: a CC licence on Jamendo, the Internet Archive or Commons is only what the uploader
// claimed. Nobody can verify it from metadata. What can be caught is the obvious case: a track whose title is a
// well-known song that is still protected (writers died less than 70 years ago or are alive), uploaded by someone
// who is not one of its writers. The facts come from MusicBrainz (crawler/rechtecheck.mjs); this file only
// judges them, so the site build and the report use the same rule.

export const SCHUTZFRIST = 70;

// Words in a title or description that say the track is someone else's song.
const FREMD_HINWEIS = /\b(covers?|karaoke|tribute|originally (performed |sung )?by|in the style of|nachgespielt|coverversion)\b/i;

/** Title reduced to what a song title in MusicBrainz looks like: no track number, file ending, version notes. */
export function titelNormal(titel = '') {
  return String(titel)
    .toLowerCase()
    .replace(/\.(mp3|ogg|oga|flac|wav|opus|m4a)$/i, '')
    .replace(/^\s*(track\s*)?\d{1,3}\s*[-._)]\s*/i, '')
    .replace(/\s*[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/\s+(-|–|—)\s+.*(mix|version|edit|live|remaster(ed)?|instrumental|cover|demo|take)\b.*$/i, '')
    .replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/i, '')
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const nameNormal = (n = '') => String(n).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');

/** Whether one writer still holds rights in `jahr`: alive, or died within the last 70 years. */
export function geschuetzt(autor, jahr = new Date().getFullYear()) {
  if (autor.tod) return autor.tod > jahr - SCHUTZFRIST - 1;
  if (autor.geboren) return autor.geboren > jahr - 110;
  return null; // unknown: no reason on its own
}

/**
 * How strongly a title points to one protected work: a rare title with a standard behind it ("Jingle Bell Rock",
 * 3 works of that name, 324 recordings), or a world hit whose title a few minor works share as well
 * ("Bohemian Rhapsody", 6 works, 461 recordings). Thresholds checked against the Jamendo titles, 26.11.2026.
 */
export function einstufen(aufnahmen, gleichnamig) {
  if ((gleichnamig <= 3 && aufnahmen >= 20) || (gleichnamig <= 10 && aufnahmen >= 150)) return 'fremd';
  if (gleichnamig <= 3 && aufnahmen >= 3) return 'verdacht';
  return null;
}

/**
 * Verdict for one catalogue entry, given the MusicBrainz facts for its normalised title
 * ({ gleichnamig, werke: [{ id, titel, aufnahmen, iswc, autoren: [{ name, tod?, geboren? }] }] } or null when not
 * looked up; gleichnamig = how many works at MusicBrainz carry exactly this title).
 *   fremd    the title belongs to one well-known protected song (many recordings, hardly any other work of that
 *            name), uploader not among its writers: kept out of the catalogue
 *   verdacht a protected song with that distinctive title has only a few recordings, or the text says cover:
 *            listed in the report for a look
 * A common title ("Meditation", "Lullaby", "The End") says nothing about which song it is, so it is not judged at
 * all: hundreds of own tracks carry such titles, and a report full of them would not be read.
 *   ok       no match, public domain, or the uploader is one of the writers
 *   offen    not looked up yet
 */
export function urteil(item, fakten, { jahr = new Date().getFullYear() } = {}) {
  const hinweis = FREMD_HINWEIS.test(`${item.title} ${item.description ?? ''}`);
  if (!fakten) return { stufe: hinweis ? 'verdacht' : 'offen', grund: hinweis ? 'Titel oder Beschreibung nennt ein Cover' : undefined };
  const urheber = nameNormal(item.creator?.name);
  let best = null;
  for (const w of fakten.werke ?? []) {
    const eigen = w.autoren.some((a) => urheber && (nameNormal(a.name) === urheber || urheber.includes(nameNormal(a.name)) && nameNormal(a.name).length > 5));
    if (eigen) return { stufe: 'ok', grund: 'Hochlader ist Urheber des Werks', werk: w };
    const schutz = w.autoren.map((a) => geschuetzt(a, jahr));
    if (!schutz.includes(true)) continue; // public domain, or nothing known about the writers
    const stufe = einstufen(w.aufnahmen, fakten.gleichnamig ?? 999);
    const rang = (b) => (b.stufe === 'fremd' ? 1e9 : 0) + b.werk.aufnahmen;
    if (stufe && (!best || rang({ stufe, werk: w }) > rang(best))) best = { stufe, werk: w };
  }
  if (best) {
    const namen = best.werk.autoren.map((a) => a.name).join(', ');
    return { ...best, grund: `„${best.werk.titel}“ von ${namen}, ${best.werk.aufnahmen} Aufnahmen bei MusicBrainz` };
  }
  return hinweis ? { stufe: 'verdacht', grund: 'Titel oder Beschreibung nennt ein Cover' } : { stufe: 'ok' };
}
