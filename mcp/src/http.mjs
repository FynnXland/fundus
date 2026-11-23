// Remote Fundus MCP server over Streamable HTTP, runtime-neutral (Workers, Pages Functions, Deno, Bun, Node via
// a Request). Stateless: every request builds a fresh McpServer from the same factory; the core and its caches
// live as long as the isolate. Clients of the 2025 protocol revisions get the SDK's stateless fallback.
// No logging here: the server keeps no record of who asked what (docs/stand/fundus-mcp.md, Datenschutz).
import { createMcpHandler } from '@modelcontextprotocol/server';
import { baueServer } from './werkzeuge.mjs';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'mcp-protocol-version, mcp-session-id',
  'access-control-max-age': '86400',
};

/** Returns fetch(request) -> Response for the MCP endpoint. kern: erstelleKern(), codec: WebP codec or null. */
export function erstelleHttp({ kern, codec = null }) {
  const handler = createMcpHandler(() => baueServer({ kern, codec }), { legacy: 'stateless' });
  return async function fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const res = await handler.fetch(request);
    const kopf = new Headers(res.headers);
    kopf.set('access-control-allow-origin', CORS['access-control-allow-origin']);
    kopf.set('access-control-expose-headers', CORS['access-control-expose-headers']);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: kopf });
  };
}
