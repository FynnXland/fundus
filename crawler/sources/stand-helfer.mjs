// Shared crawl-state helpers for the picture sources that work in stages (Cleveland, Rijksmuseum, Wellcome, SMK, NGA).
// One strand = one listing that is read page by page; `weiter` is whatever the source needs to continue
// (offset, token, filter position). Everything except load/save is pure so tests need no files.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const DAY = 86400000;

export const emptyStrand = () => ({ weiter: null, fertig: false, fertigAm: null, seiten: 0 });

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/**
 * A finished strand starts again once `nachTagen` days have passed (never on the day it finished),
 * which picks up objects added since.
 */
export function prepareStrand(strand, { heute, nachTagen = 14 }) {
  const s = strand && typeof strand === 'object' ? { ...emptyStrand(), ...strand } : emptyStrand();
  if (s.fertig && s.fertigAm && daysBetween(s.fertigAm, heute) >= Math.max(1, Number(nachTagen) || 14)) {
    return { ...emptyStrand(), seiten: 0 };
  }
  return s;
}

/** Records one fetched page. `weiter === null` or `undefined` means the listing is at its end. */
export function advanceStrand(strand, weiter, heute) {
  const seiten = (strand.seiten ?? 0) + 1;
  if (weiter === null || weiter === undefined) return { weiter: null, fertig: true, fertigAm: heute, seiten };
  return { weiter, fertig: false, fertigAm: null, seiten };
}

export async function loadJson(path, fallback) {
  try {
    const st = JSON.parse(await readFile(path, 'utf8'));
    if (st && st.version === 1) return st;
  } catch {}
  return fallback;
}

export async function saveJson(path, st) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(st, null, 1));
  await rename(tmp, path);
}
