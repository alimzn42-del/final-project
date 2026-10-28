/**
 * The web app (Vite + React). In development the API and the live push are
 * proxied to the backend, so the browser sees one address, as with nginx.
 */
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

const backend = `http://localhost:${process.env.PORT ?? '3000'}`;

export default defineConfig({
  plugins: [react()],
  // Workspace packages (@mixline/shared) are used from their TypeScript source.
  resolve: { conditions: ['source', ...defaultClientConditions] },
  server: {
    port: 5173,
    proxy: { '/api': { target: backend, ws: true } },
  },
  build: { outDir: 'dist', sourcemap: true },
});
