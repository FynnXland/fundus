import { defineConfig } from 'vite';

// Ports from the free block in E:\Entwicklung\_Verwaltung\PORTS.md (4570–4579).
export default defineConfig({
  server: { port: 4570, strictPort: true },
  preview: { port: 4571, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
