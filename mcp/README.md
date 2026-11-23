# fundus-mcp

MCP server for the Fundus catalogue of free assets (pictures, 3D models, materials, HDRIs, icons, music, sounds,
fonts, scripts, projects, Claude skills, videos). Your AI can search the catalogue, look at small previews (several
as one numbered contact sheet), read license and attribution, and download files straight from the original source.
Fundus hosts no files.

Setup for Claude Desktop, Claude Code and Cursor: [docs/KI-ANBINDUNG.md](../docs/KI-ANBINDUNG.md) (German).

```
npx -y fundus-mcp          # local server over stdio, can save downloads (FUNDUS_ZIEL)
```

| file | role |
|---|---|
| `src/kern.mjs` | reads the site's static files over HTTP: search, listing, entries, previews (Node and Workers) |
| `src/werkzeuge.mjs` | the MCP tools, one factory for both entries |
| `src/stdio.mjs` | local entry (stdio), with `src/laden.mjs` (downloads) and `src/codec-node.mjs` |
| `src/http.mjs`, `src/worker.mjs` | remote entry (Streamable HTTP) for a Cloudflare Pages Function or Worker |
| `src/suchindex.mjs` | copy of `crawler/lib/suchindex.mjs` (`npm run sync`, checked by the tests) |
| `scripts/probelauf.mjs` | real run against a running site, default `http://localhost:4570` |

Tests: `node --test tests/mcp.test.mjs` in the repository root (after `npm install` here).
