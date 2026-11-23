// Packages (a glTF model with its textures, a skill folder): the browser fetches every file straight from
// the source and zips them locally. Nothing passes through a Fundus server.
import { zip } from 'fflate';

export async function paketLaden(paket, fortschritt) {
  const dateien = {};
  let n = 0;
  for (const f of paket.files) {
    fortschritt(++n, paket.files.length);
    const res = await fetch(f.url, { referrerPolicy: 'no-referrer', credentials: 'omit' });
    if (!res.ok) throw new Error(`${f.path}: HTTP ${res.status}`);
    dateien[f.path] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }];
  }
  const daten = await new Promise((resolve, reject) => zip(dateien, (err, out) => (err ? reject(err) : resolve(out))));
  const url = URL.createObjectURL(new Blob([daten], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${paket.name}.zip`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
