// Contact sheet: several own previews scaled down into one numbered WebP picture.
// Why: image tokens grow with the pixel count (Claude: about width × height / 750). A 320 × 240 preview costs
// about 100 tokens, a 160 × 120 cell about 26. Putting full-size previews on one sheet would save nothing; the
// saving comes from the smaller cells. The codec (jsquash WebP, WASM) is passed in, because Node and Workers
// load WASM differently (stdio.mjs, worker.mjs).

// 3 × 5 pixel digits, one row per string, '1' = set
const ZIFFERN = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};

/** Box filter into a w × h area of the sheet, keeping the aspect ratio (letterboxed, centred). */
function einpassen(bild, ziel, breite, x0, y0, w, h) {
  const f = Math.min(w / bild.width, h / bild.height, 1);
  const bw = Math.max(1, Math.round(bild.width * f));
  const bh = Math.max(1, Math.round(bild.height * f));
  const ox = x0 + Math.floor((w - bw) / 2);
  const oy = y0 + Math.floor((h - bh) / 2);
  const sx = bild.width / bw;
  const sy = bild.height / bh;
  const q = bild.data;
  for (let y = 0; y < bh; y++) {
    const ya = Math.floor(y * sy);
    const yb = Math.max(ya + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < bw; x++) {
      const xa = Math.floor(x * sx);
      const xb = Math.max(xa + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = ya; yy < yb; yy++) {
        for (let xx = xa; xx < xb; xx++) {
          const i = (yy * bild.width + xx) * 4;
          r += q[i]; g += q[i + 1]; b += q[i + 2]; a += q[i + 3]; n++;
        }
      }
      const j = ((oy + y) * breite + ox + x) * 4;
      // transparent pixels (icons, fonts) over the sheet background
      const al = a / n / 255;
      ziel[j] = Math.round((r / n) * al + ziel[j] * (1 - al));
      ziel[j + 1] = Math.round((g / n) * al + ziel[j + 1] * (1 - al));
      ziel[j + 2] = Math.round((b / n) * al + ziel[j + 2] * (1 - al));
      ziel[j + 3] = 255;
    }
  }
}

function zahl(ziel, breite, x0, y0, n) {
  const text = String(n);
  const s = 2; // pixel size of one font dot
  const w = text.length * 4 * s + s;
  const h = 7 * s;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = ((y0 + y) * breite + x0 + x) * 4;
    ziel[j] = 30; ziel[j + 1] = 27; ziel[j + 2] = 24; ziel[j + 3] = 255;
  }
  [...text].forEach((c, k) => {
    ZIFFERN[c].forEach((zeile, zy) => {
      [...zeile].forEach((p, zx) => {
        if (p !== '1') return;
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
          const j = ((y0 + s + zy * s + dy) * breite + x0 + s + (k * 4 + zx) * s + dx) * 4;
          ziel[j] = 255; ziel[j + 1] = 255; ziel[j + 2] = 255;
        }
      });
    });
  });
}

/**
 * codec: { decode(ArrayBuffer) -> ImageData-like, encode(ImageData-like, opts) -> ArrayBuffer }.
 * bilder: [{ nr, bytes: Uint8Array }]. Returns { bytes, breite, hoehe }.
 */
export async function kontaktbogen(codec, bilder, { zelle = 160, spalten } = {}) {
  const w = Math.max(64, Math.min(320, Math.round(zelle)));
  const h = Math.round((w * 3) / 4);
  const n = bilder.length;
  const sp = spalten ?? Math.min(n, n <= 4 ? n : n <= 9 ? 3 : 4);
  const zeilen = Math.ceil(n / sp);
  const rand = 4;
  const breite = sp * w + (sp + 1) * rand;
  const hoehe = zeilen * h + (zeilen + 1) * rand;
  const daten = new Uint8ClampedArray(breite * hoehe * 4);
  for (let i = 0; i < daten.length; i += 4) { daten[i] = 245; daten[i + 1] = 241; daten[i + 2] = 236; daten[i + 3] = 255; }
  for (let i = 0; i < n; i++) {
    const x0 = rand + (i % sp) * (w + rand);
    const y0 = rand + Math.floor(i / sp) * (h + rand);
    const b = bilder[i].bytes;
    try {
      const bild = await codec.decode(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      einpassen(bild, daten, breite, x0, y0, w, h);
    } catch {
      // unreadable picture: the cell stays empty, the number still marks it
    }
    zahl(daten, breite, x0, y0, bilder[i].nr);
  }
  const out = await codec.encode({ data: daten, width: breite, height: hoehe, colorSpace: 'srgb' }, { quality: 72 });
  return { bytes: new Uint8Array(out), breite, hoehe };
}

/** Base64 without Buffer (Workers have btoa). */
export function base64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
