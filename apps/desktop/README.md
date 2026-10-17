# Ego Lite desktop console

This package is a small Electron + React desktop scaffold for targets, live browser traffic, findings, and report inventory. The renderer has no Node integration; all data is read through the typed `contextBridge` in `src/preload.ts`.

## Run

```bash
npm install
npm run typecheck
npm test
npm run build
npm start
```

For local development, `npm run dev` starts Vite on `127.0.0.1:5173` and launches Electron against it. The production build emits the renderer to `dist/renderer`, and bundles the ESM main process and CommonJS preload bridge to `dist/main.mjs` and `dist/preload.cjs`.

## Integration assumption

`src/backend.ts` is the intentional parent integration seam. Replace `createDesktopBackend()` with an adapter over the parent `packages/security-core` stores (or an in-process MCP client) implementing the four read-only list methods. This package does not assume a relative path to security-core because the parent workspace manifest and dependency graph own that wiring.

The scaffold only exposes read-only IPC channels. Active DAST controls belong in the MCP/security-core policy path and are not reachable from this renderer bridge.
