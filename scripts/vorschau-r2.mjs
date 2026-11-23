// Keeps the R2 bucket of the previews in line with data/vorschauen.json (worker/index.mjs serves them on /vorschau/*).
//
//   node scripts/vorschau-r2.mjs liste     writes the keys in the bucket to .cache/r2-vorschau.json; the preview run
//                                          (crawler/thumbs.mjs) then counts those as present and does not rebuild
//                                          them on a fresh CI runner that has no public/vorschau
//   node scripts/vorschau-r2.mjs abgleich  uploads local previews that are missing or changed (MD5 against the
//                                          ETag) and deletes keys the register no longer names
//   --probe                                only counts, changes nothing
//
// Credentials (R2 API token with "Object Read & Write" on this bucket only, created by Fynn in the dashboard):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, optional R2_BUCKET (default fundus-vorschau)
import { AwsClient } from 'aws4fetch';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const ZIEL = 'public/vorschau';
export const LISTE = '.cache/r2-vorschau.json';

function zugang() {
  const { R2_ACCOUNT_ID: konto, R2_ACCESS_KEY_ID: id, R2_SECRET_ACCESS_KEY: geheim } = process.env;
  if (!konto || !id || !geheim) throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID und R2_SECRET_ACCESS_KEY fehlen');
  const bucket = process.env.R2_BUCKET || 'fundus-vorschau';
  return { aws: new AwsClient({ accessKeyId: id, secretAccessKey: geheim, service: 's3', region: 'auto' }), basis: `https://${konto}.r2.cloudflarestorage.com/${bucket}` };
}

const xmlWerte = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((m) => m[1]);

/** All keys with their ETag (ListObjectsV2, 1000 per page). */
export async function auflisten({ aws, basis }) {
  const schluessel = new Map();
  let weiter;
  do {
    const u = new URL(basis);
    u.searchParams.set('list-type', '2');
    u.searchParams.set('max-keys', '1000');
    if (weiter) u.searchParams.set('continuation-token', weiter);
    const res = await aws.fetch(u);
    if (!res.ok) throw new Error(`Liste: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const xml = await res.text();
    const keys = xmlWerte(xml, 'Key');
    const etags = xmlWerte(xml, 'ETag').map((e) => e.replace(/&quot;|"/g, ''));
    keys.forEach((k, i) => schluessel.set(k, etags[i]));
    weiter = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xmlWerte(xml, 'NextContinuationToken')[0] : undefined;
  } while (weiter);
  return schluessel;
}

/** What to upload and what to delete: pure, so it can be tested without a bucket. */
export function plan(register, imBucket, lokalMd5) {
  const soll = new Set(Object.values(register).map((r) => r.pfad).filter(Boolean));
  const hoch = [];
  for (const pfad of soll) {
    const md5 = lokalMd5(pfad);
    if (md5 && imBucket.get(pfad) !== md5) hoch.push(pfad);
  }
  const weg = [...imBucket.keys()].filter((k) => !soll.has(k));
  return { hoch, weg };
}

async function pool(liste, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < liste.length) await fn(liste[i++]); }));
}

async function main() {
  const [befehl] = process.argv.slice(2);
  const probe = process.argv.includes('--probe');
  const z = zugang();
  const imBucket = await auflisten(z);
  if (befehl === 'liste') {
    await mkdir('.cache', { recursive: true });
    await writeFile(LISTE, JSON.stringify([...imBucket.keys()]));
    console.log(`${imBucket.size} Vorschaubilder im Bucket, Liste in ${LISTE}`);
    return;
  }
  if (befehl !== 'abgleich') throw new Error('Befehl: liste oder abgleich');
  const register = JSON.parse(await readFile('data/vorschauen.json', 'utf8'));
  const md5 = new Map();
  for (const r of Object.values(register)) {
    if (r.pfad && existsSync(`${ZIEL}/${r.pfad}`)) md5.set(r.pfad, createHash('md5').update(await readFile(`${ZIEL}/${r.pfad}`)).digest('hex'));
  }
  const { hoch, weg } = plan(register, imBucket, (p) => md5.get(p));
  console.log(`Im Bucket ${imBucket.size}, hochladen ${hoch.length}, löschen ${weg.length}${probe ? ' (Probe, nichts geändert)' : ''}`);
  if (probe) return;
  let fertig = 0, fehler = 0;
  await pool(hoch, 16, async (pfad) => {
    const res = await z.aws.fetch(`${z.basis}/${pfad}`, { method: 'PUT', body: await readFile(`${ZIEL}/${pfad}`), headers: { 'Content-Type': 'image/webp' } });
    if (!res.ok) { fehler++; console.error(`  ${pfad}: HTTP ${res.status}`); }
    if (++fertig % 1000 === 0) console.log(`  ${fertig}/${hoch.length}`);
  });
  await pool(weg, 8, async (k) => {
    const res = await z.aws.fetch(`${z.basis}/${k}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) { fehler++; console.error(`  löschen ${k}: HTTP ${res.status}`); }
  });
  console.log(`Fertig: ${hoch.length - fehler} hochgeladen, ${weg.length} gelöscht, ${fehler} Fehler.`);
  if (fehler) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('vorschau-r2.mjs')) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
