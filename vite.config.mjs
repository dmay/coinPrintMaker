import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: fileURLToPath(new URL('./app', import.meta.url)),
  base: './',
  publicDir: false,
  plugins: [react()],
  build: {
    // Never point Vite at the repository root. build:pages supplies a fresh stage.
    outDir: fileURLToPath(new URL('./.vite-dist', import.meta.url)),
    emptyOutDir: false,
  },
});
