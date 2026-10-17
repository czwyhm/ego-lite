import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import { fileURLToPath } from 'node:url';

await viteBuild({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) });
await esbuild({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron', '@ego-lite/mcp', '@ego-lite/browser-adapter', '@ego-lite/security-core', 'playwright', 'playwright-core', 'chromium-bidi'],
  sourcemap: true,
});
await esbuild({
  entryPoints: ['src/preload.ts'],
  outfile: 'dist/preload.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
});
