// Normalises the licence strings that the sources deliver (Openverse codes, Wikimedia short names,
// SPDX ids from GitHub, Creative Commons URLs) into one record. Only licences that allow use,
// modification and redistribution, including commercial use, are accepted. NC and ND variants,
// "NOASSERTION" and unknown strings return null, and the crawler drops the item.

const CC_VERSIONS = ['1.0', '2.0', '2.5', '3.0', '4.0'];

const CODE_LICENSES = {
  'MIT': { name: 'MIT', attribution: true, shareAlike: false },
  'Apache-2.0': { name: 'Apache 2.0', attribution: true, shareAlike: false },
  'BSD-2-Clause': { name: 'BSD 2-Clause', attribution: true, shareAlike: false },
  'BSD-3-Clause': { name: 'BSD 3-Clause', attribution: true, shareAlike: false },
  'ISC': { name: 'ISC', attribution: true, shareAlike: false },
  '0BSD': { name: 'BSD Zero Clause', attribution: false, shareAlike: false },
  'Unlicense': { name: 'The Unlicense', attribution: false, shareAlike: false },
  'Zlib': { name: 'zlib', attribution: false, shareAlike: false },
  'BSL-1.0': { name: 'Boost 1.0', attribution: true, shareAlike: false },
  'MPL-2.0': { name: 'MPL 2.0', attribution: true, shareAlike: true },
  'EPL-2.0': { name: 'EPL 2.0', attribution: true, shareAlike: true },
  'EUPL-1.2': { name: 'EUPL 1.2', attribution: true, shareAlike: true },
  'Artistic-2.0': { name: 'Artistic 2.0', attribution: true, shareAlike: false },
  'LGPL-2.1': { name: 'LGPL 2.1', attribution: true, shareAlike: true },
  'LGPL-3.0': { name: 'LGPL 3.0', attribution: true, shareAlike: true },
  'GPL-2.0': { name: 'GPL 2.0', attribution: true, shareAlike: true },
  'GPL-3.0': { name: 'GPL 3.0', attribution: true, shareAlike: true },
  'AGPL-3.0': { name: 'AGPL 3.0', attribution: true, shareAlike: true },
  'OFL-1.1': { name: 'SIL Open Font License 1.1', attribution: true, shareAlike: true },
};

function ccRecord(kind, version) {
  const v = CC_VERSIONS.includes(version) ? version : '4.0';
  if (kind === 'cc0') {
    return { id: 'CC0-1.0', name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/deed.de', attribution: false, shareAlike: false, family: 'gemeinfrei' };
  }
  if (kind === 'pdm') {
    return { id: 'PDM-1.0', name: 'Public Domain Mark 1.0', url: 'https://creativecommons.org/publicdomain/mark/1.0/deed.de', attribution: false, shareAlike: false, family: 'gemeinfrei' };
  }
  const sa = kind === 'by-sa';
  return {
    id: `CC-${sa ? 'BY-SA' : 'BY'}-${v}`,
    name: `CC ${sa ? 'BY-SA' : 'BY'} ${v}`,
    url: `https://creativecommons.org/licenses/${kind}/${v}/deed.de`,
    attribution: true,
    shareAlike: sa,
    family: 'cc',
  };
}

function codeRecord(spdx) {
  const base = CODE_LICENSES[spdx];
  if (!base) return null;
  return { id: spdx, name: base.name, url: `https://spdx.org/licenses/${spdx}.html`, attribution: base.attribution, shareAlike: base.shareAlike, family: spdx === 'OFL-1.1' ? 'schrift' : 'code' };
}

const PUBLIC_DOMAIN = { id: 'PD', name: 'Gemeinfrei', url: 'https://creativecommons.org/publicdomain/mark/1.0/deed.de', attribution: false, shareAlike: false, family: 'gemeinfrei' };

// SPDX ids come in several spellings ("GPL-3.0-only", "gpl-3.0", "GPL-3.0-or-later").
function canonicalSpdx(raw) {
  const s = raw.trim().replace(/-(only|or-later)$/i, '').replace(/\+$/, '');
  const hit = Object.keys(CODE_LICENSES).find((k) => k.toLowerCase() === s.toLowerCase());
  if (hit) return hit;
  if (/^ofl-1\.1/i.test(s)) return 'OFL-1.1';
  return null;
}

/**
 * @param {string} raw  licence code, short name, SPDX id or URL
 * @param {string} [version]  optional version (Openverse delivers it separately)
 * @returns {null | {id,name,url,attribution,shareAlike,family}}
 */
export function normalizeLicense(raw, version) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  const lower = s.toLowerCase();

  // Creative Commons URL
  const url = lower.match(/creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/(\d\.\d)/);
  if (url) {
    const [, , code, v] = url;
    if (code === 'zero') return ccRecord('cc0');
    if (code === 'mark') return ccRecord('pdm');
    if (code === 'by' || code === 'by-sa') return ccRecord(code, v);
    return null;
  }
  if (/creativecommons\.org\/publicdomain\/zero/.test(lower)) return ccRecord('cc0');

  // Anything with NC or ND is out, in every spelling.
  if (/(^|[\s_-])(nc|nd)([\s_-]|$)/i.test(s) || /noncommercial|non-commercial|noderiv/i.test(s)) return null;

  // Openverse codes and Wikimedia short names: "by", "by-sa", "cc0", "pdm", "CC BY-SA 4.0", "CC-BY-3.0"
  const cc = lower.replace(/_/g, '-').match(/^(?:cc[\s-]?)?(by-sa|by|cc0|zero|pdm)(?:[\s-]?(\d\.\d))?(?:[\s-].*)?$/);
  if (cc) {
    const code = cc[1] === 'zero' ? 'cc0' : cc[1];
    return ccRecord(code, cc[2] || version);
  }
  if (/^cc0/.test(lower)) return ccRecord('cc0');
  if (/^(public domain|pd|gemeinfrei|no restrictions|pd-us|pd-usgov|pd-old)/.test(lower)) return { ...PUBLIC_DOMAIN };

  const spdx = canonicalSpdx(s);
  if (spdx) return codeRecord(spdx);
  return null;
}

/**
 * Ready-to-copy credit line in the TASL form (title, author, source, licence).
 * CC0 and public domain need no credit; the text then says so and offers a courtesy line.
 */
export function attributionText({ title, creator, sourceUrl, license }) {
  const who = creator?.name ? ` von ${creator.name}` : '';
  const base = `„${title}“${who}, ${sourceUrl}`;
  if (!license.attribution) return `${base} (${license.name}, Namensnennung nicht erforderlich)`;
  return `${base}, Lizenz: ${license.name} (${license.url})`;
}
