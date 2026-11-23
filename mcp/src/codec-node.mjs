// WebP codec for Node: the WASM files of @jsquash/webp are read from disk and compiled once.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import decode, { init as initDecode } from '@jsquash/webp/decode.js';
import encode, { init as initEncode } from '@jsquash/webp/encode.js';

let bereit = null;
export function nodeCodec() {
  bereit ??= (async () => {
    const ordner = createRequire(import.meta.url).resolve('@jsquash/webp/package.json').replace(/package\.json$/, '');
    await initDecode(await WebAssembly.compile(await readFile(`${ordner}codec/dec/webp_dec.wasm`)));
    await initEncode(await WebAssembly.compile(await readFile(`${ordner}codec/enc/webp_enc.wasm`)));
    return { decode, encode };
  })();
  return bereit;
}
