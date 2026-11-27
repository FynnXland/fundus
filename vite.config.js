import { defineConfig } from 'vite';

// Ports from the free block in E:\Entwicklung\_Verwaltung\PORTS.md (4570–4579).
// The headline font and the mono font of the MCP address are asked for as soon as the HTML arrives, not only when
// the script has drawn the text that uses them: without that the start page was drawn in the fallback font first.
const schriftenVorladen = () => ({
  name: 'fundus-schriften-vorladen',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      return Object.keys(ctx.bundle ?? {})
        .filter((f) => /(fraunces-latin-full-normal|ibm-plex-mono-latin-500-normal)-[\w-]+\.woff2$/.test(f))
        .map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${f}`, crossorigin: '' }, injectTo: 'head' }));
    },
  },
});

export default defineConfig({
  plugins: [schriftenVorladen()],
  server: { port: 4570, strictPort: true },
  preview: { port: 4571, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
