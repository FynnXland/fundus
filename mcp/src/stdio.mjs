#!/usr/bin/env node
// Local Fundus MCP server over stdio (Claude Desktop, Claude Code, Cursor, any MCP client that starts a command).
// Reads the public data of the website over HTTP and can save downloads into a folder.
//   FUNDUS_URL       site address, default below (data under /data, previews under /vorschau)
//   FUNDUS_DATEN     data address, if not <FUNDUS_URL>/data
//   FUNDUS_VORSCHAU  preview address, if not <FUNDUS_URL>/vorschau (e.g. R2 later)
//   FUNDUS_ZIEL      default download folder (else ~/Downloads/Fundus)
// stdout belongs to the protocol: messages go to stderr only.
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { erstelleKern } from './kern.mjs';
import { baueServer } from './werkzeuge.mjs';
import { erstelleDownloader, erstelleQuellbild } from './laden.mjs';
import { nodeCodec } from './codec-node.mjs';

// TODO(Hosting): replace by the public address once the site is online (docs/stand/fundus-mcp.md)
export const STANDARD_URL = 'http://localhost:4570';

const url = (process.env.FUNDUS_URL || STANDARD_URL).replace(/\/+$/, '');
const kern = erstelleKern({ daten: process.env.FUNDUS_DATEN || `${url}/data`, vorschau: process.env.FUNDUS_VORSCHAU || `${url}/vorschau` });
let codec = null;
try {
  codec = await nodeCodec();
} catch (err) {
  console.error(`fundus-mcp: no contact sheets (WebP codec not loaded: ${err.message})`);
}
const herunterladen = erstelleDownloader();
const quellbild = erstelleQuellbild();

serveStdio(() => baueServer({ kern, codec, herunterladen, quellbild }), { onerror: (err) => console.error(`fundus-mcp: ${err.message}`) });
console.error(`fundus-mcp läuft (Daten: ${url})`);
