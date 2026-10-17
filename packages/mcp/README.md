# Ego Lite MCP service

This package is a package-local, newline-delimited JSON-RPC MCP server. It intentionally uses a small standards-compatible transport rather than the official `@modelcontextprotocol/sdk`: the service only needs MCP `initialize`, `ping`, `tools/list`, and `tools/call`, and keeping the transport dependency-free makes the offline build/test path reproducible. The wire contract follows the MCP protocol and can be replaced by the official SDK later without changing the `DataProvider` interface.

## Run

```bash
npm install
npm test
npm start
```

The executable reads one JSON-RPC request per line and writes one JSON-RPC response per line. Logs must stay off stdout so MCP clients can parse the stream.

## Tools

The default service exposes read-only tools:

- `ego_targets_list`
- `ego_browser_observation`
- `ego_telemetry_get` (request URLs and headers are redacted)
- `ego_page_analyze`
- `ego_findings_list`
- `ego_report_export`
- `ego_host_connections` (best-effort Windows/Linux metadata; no packet payloads)

Active `ego_dast_run` is absent unless `EGO_MCP_ENABLE_DAST=true`. Even when enabled, a call must provide `policyAcknowledged: true`, the exact `confirmation` phrase `I_CONFIRM_DAST`, `policy.allowlisted: true`, a permitted `test`/`staging` environment, and a bounded `maxRequests`. Optional environment variables further restrict the allowlist:

```text
EGO_MCP_ENABLE_DAST=true
EGO_MCP_DAST_TARGETS=staging-app
EGO_MCP_DAST_ENVIRONMENTS=test,staging
EGO_MCP_DAST_MAX_REQUESTS=50
```

## Parent integration

`McpServer` accepts a `DataProvider` in `src/types.ts`. The stdio entry point
uses `PlaywrightDataProvider`, which reads authorized targets from
`EGO_SECURITY_TARGETS_JSON`, lazily opens an isolated Chromium page for browser
observations, stores redacted telemetry locally, and exposes the security-core
analysis results. A parent application can replace it with its own provider
without changing the MCP transport.

The provider owns browser integration. This package only returns read-only metadata and enforces the MCP-side DAST gate; security-core should retain its own authorization, audit, and execution checks.
