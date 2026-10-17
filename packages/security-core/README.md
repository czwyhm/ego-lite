# `@ego-lite/security-core`

The security core is a small, dependency-free-at-runtime TypeScript package for
browser request telemetry, defensive web checks, guarded low-risk DAST, and
best-effort host connection metadata. It deliberately does not capture request
bodies, run exploit payloads, or make network requests on its own.

## Setup

Use Node.js 22.14.0 (the version in `.nvmrc`), then install the package-local
development dependencies:

```bash
npm ci
```

## Build, test, and use

```bash
npm run typecheck
npm test
npm run build
```

Import the public API from `dist/src/index.js` after building. The package has
no default network transport: callers must inject a transport into
`executeDastPlan`, and must supply an explicit target allowlist and a confirmed
test/staging context for DAST.

SQLite persistence uses Node's built-in `node:sqlite` (`SQLiteSecurityStore`)
and therefore needs a Node 22 release that includes that built-in (22.5+;
22.14.0 is pinned here). Pass `:memory:` for an ephemeral store or a path to a
local database file whose parent directory already exists.

## Docker

The package can be built and checked without parent-repository dependencies:

```bash
docker build -t ego-security-core .
docker run --rm ego-security-core
```

The default container command runs the package's offline tests. Deployment is
normally by copying `dist/` into the parent application and importing the
package export; this package does not run a server by itself.

## Public surface

`src/index.ts` is the only supported import surface. It exports typed models,
`normalizeBrowserRequest`, `redactSecrets`, `evaluateTarget`,
`analyzeWebResponse`, `createDastPlan`/`executeDastPlan`, host metadata parsers,
and `SQLiteSecurityStore`.
