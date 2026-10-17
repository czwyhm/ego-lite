import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: resolve(packageRoot, 'src/renderer'),
  plugins: [react()],
  base: './',
  build: {
    outDir: resolve(packageRoot, 'dist/renderer'),
    emptyOutDir: false,
    rollupOptions: { input: resolve(packageRoot, 'src/renderer/index.html') },
  },
});
