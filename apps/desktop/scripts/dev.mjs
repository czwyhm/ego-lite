import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { build as esbuild } from 'esbuild';

await esbuild({ entryPoints: ['src/main.ts'], outfile: 'dist/main.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['electron', '@ego-lite/mcp', '@ego-lite/browser-adapter', '@ego-lite/security-core', 'playwright', 'playwright-core', 'chromium-bidi'], sourcemap: true });
await esbuild({ entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], sourcemap: true });

const viteCli = join('node_modules', 'vite', 'bin', 'vite.js');
const electronBinary = process.platform === 'win32'
  ? join('node_modules', 'electron', 'dist', 'electron.exe')
  : join('node_modules', 'electron', 'dist', 'electron');
if (!existsSync(viteCli) || !existsSync(electronBinary)) throw new Error('Run npm install before starting desktop development.');

const vite = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '5173'], { stdio: 'inherit' });
let electron;
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  vite.kill();
  electron?.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    const response = await fetch('http://127.0.0.1:5173');
    if (response.ok) break;
  } catch { /* Vite is still starting. */ }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
electron = spawn(electronBinary, ['dist/main.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, EGO_DESKTOP_DEV_SERVER_URL: 'http://127.0.0.1:5173' },
});
electron.on('exit', (code) => { stop(); process.exit(code ?? 0); });
