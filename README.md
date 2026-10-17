<div align="center">

<img src="docs/assets/banner.png" alt="ego lite" width="100%" />

**The fastest browser for AI agents to run web automation**

<a href="https://trendshift.io/repositories/42334?utm_source=repository-badge&amp;utm_medium=badge&amp;utm_campaign=badge-repository-42334" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/repositories/42334" alt="citrolabs%2Fego-lite | Trendshift" width="250" height="55"/></a>

<p>
  <a href="https://cdn.ego.app/setup/macos/arm64/egolite-Y7MbxKIuhzFB.dmg"><img src="https://img.shields.io/badge/Download-Apple%20Silicon-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download for Apple Silicon" /></a>
  <a href="https://cdn.ego.app/setup/macos/x64/egolite-Y7MbxKIuhzFB.dmg"><img src="https://img.shields.io/badge/Download-Intel-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download for Intel" /></a>
  <a href="https://discord.gg/5eGZVvHbTq"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord" /></a>
  <a href="https://x.com/ego_agent"><img src="https://img.shields.io/badge/Follow-%40ego__agent-000000?style=for-the-badge&logo=x&logoColor=white" alt="Follow @ego_agent on X" /></a>
  <a href="https://lite.ego.app/document/"><img src="https://img.shields.io/badge/Docs-lite.ego.app-1E90FF?style=for-the-badge&logo=gitbook&logoColor=white" alt="Docs" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-3DA639?style=for-the-badge" alt="License MIT" /></a>
</p>

<p>
  <b>English</b> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.pt.md">Português</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.it.md">Italiano</a> ·
  <a href="README.ru.md">Русский</a>
</p>

</div>

ego (lite) is a browser where you and your AI agents work in parallel. Your agents run their browser tasks in their own Spaces, isolated workspaces inside the same browser, while you keep browsing in yours, so no agent ever takes the browser away from you. And the automation itself finishes faster, on fewer tokens.

Existing tools like browser-use and agent-browser are a bridge to the browser, not a browser of their own: they need a separate one to drive, your browser data rarely carries over intact, the connection is unstable, and you and the agent end up fighting over control of the browser. ego lite is one browser designed from the start for the two of you to share. No extra setup, and the agent can always reach your real logins and tabs through `ego-browser`.

> **Repository scope:** this repository contains the open-source `ego-browser` SDK
> and agent Skill. The closed-source Ego Lite browser application is **not
> included**. Browser actions that depend on `globalThis.ego` require a separately
> installed Ego Lite app; the local CLI and Docker image can still build and run
> SDK-only commands such as `--help`.

> **Portable security console:** this checkout also contains a Windows 11 and
> Ubuntu 24.04 foundation built on Playwright Chromium. It provides redacted
> browser request telemetry, host connection metadata adapters, passive web
> security analysis, guarded test/staging DAST probes, a local SQLite store, a
> read-only-by-default stdio MCP service, and an Electron/React console. It is
> an authorized defensive assessment tool, not a replacement for the closed
> Ego Lite browser application.

## Demo

https://github.com/user-attachments/assets/ffe7954b-58ee-411e-b35d-ec30c58a08bc

## Quick Start

ego lite runs on macOS today, a Windows closed beta is coming soon, and Linux is on the [roadmap](https://lite.ego.app/roadmap).

### 1. Install

Pick whichever fits your flow.

**1.1 Download the macOS app**

<a href="https://cdn.ego.app/setup/macos/arm64/egolite-Y7MbxKIuhzFB.dmg"><img src="https://img.shields.io/badge/⬇%20Apple%20Silicon-.dmg-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download ego lite for Apple Silicon" /></a>
<a href="https://cdn.ego.app/setup/macos/x64/egolite-Y7MbxKIuhzFB.dmg"><img src="https://img.shields.io/badge/⬇%20Intel-.dmg-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download ego lite for Intel" /></a>

Click to download, then open it to install. Either way, ego lite adds the `ego-browser` skill to every agent's skills directory on your machine.

**1.2 Add the skill with npx**

Install just the `ego-browser` skill:

```bash
npx skills add citrolabs/ego-lite
```

The first time your agent runs a browser task, it walks you through installing the ego lite app.

**1.3 Let your agent set it up**

Paste this into your agent:

```
Set up ego lite for me: https://github.com/citrolabs/ego-lite

Read `skills/ego-browser/references/install.md` and follow the steps to install ego lite.
```

On first launch, ego lite asks one question, whether to migrate your Chrome data. Say yes and your agent inherits your existing logins, cookies, extensions, and bookmarks.

### 2. Try your first task

In your agent CLI, type `/ego-browser` followed by a space, then describe what you want in plain language:

```
ego-browser follow @ego_agent on x.com for me
```

The agent picks up the `ego-browser` skill, opens the page in its own Space, reads a Snapshot (the page turned into structured text), acts on the page, and reports back, all while your own tabs stay untouched.

Your browsing data, cookies, and everything else the browser holds stay on your device. ego lite keeps its data collection deliberately narrow: simple product signals, like whether you've set ego lite as your default browser.

## Highlights of ego lite

| Feature | What it does |
|---|---|
| **Code-based, not CLI-based: faster runs on fewer tokens for complex tasks** | The capabilities ego lite exposes to the agent are wrapped as JavaScript functions the agent calls directly. The agent gets to do what it does best: write code, composing a multi-step task into a single output instead of getting stuck in a "call two commands, look at the result, call two more commands" loop. Compared to the conventional CLI approach, complex workflows finish far faster, with higher task success rates, far fewer tool calls per task, and a much lower cost per task. |
| **A dedicated Space for every agent** | ego lite gives each agent its own fully isolated Space. You browse up front, your agent works in the background, and they don't get in each other's way. You can see which Space has an agent running at any moment, and take it over or stop it whenever you want. |
| **Your agents multitask in Spaces, parallel workspaces inside the same browser** | Each Space gets its own AI agent or its own task, all running at the same time. Claude Code enriching 10 leads in 10 parallel Spaces. Codex scraping 5 competitor sites in 5 more. They don't collide or steal your tabs. Your mouse stays where you left it. |
| **The strongest page Snapshot on the market** | Thanks to customization inside the browser engine, ego lite produces the highest-quality page snapshots, the view text-only models rely on to "see" and act on a webpage. It reliably handles tough cases like deeply nested iframes, exactly where other approaches consistently break down. |
| **Any agent can drive it through `ego-browser`** | `ego-browser` is the connection layer between any agent CLI (Claude Code, Codex, Cursor, or a custom one) and ego lite. It exposes the browser as a set of in-page JavaScript tools: snapshot, fill, click, wait, navigate, capture. The agent writes a JavaScript snippet calling those tools, and `ego-browser` runs it on the page in one pass. |
| **Experience accumulation that makes your agent faster the more you use it** *(coming soon)* | Most of an agent's time on browser tasks goes to trial and error. ego lite's official Skill distills every successful action into reusable tools and workflows, so similar tasks down the line run up to 5x faster. |

## ego lite vs existing products

Most tools can automate a browser. The real questions are what browser the agent gets, whether you can keep working at the same time, and whether the tool is built for the agent you already use or a built-in one.

| Capability | ego lite | Browser-Use | agent-browser (Vercel) | ChatGPT Atlas | Perplexity Comet |
|---|:---:|:---:|:---:|:---:|:---:|
| Multitask in parallel | ✓ | — | — | — | — |
| Reusable skills | ✓ | — | — | — | — |
| Inherits Chrome's data | ✓ | — | — | ✓ | ✓ |
| Same browser, separate workspace | ✓ | — | — | — | — |
| Compressed semantic input | ✓ | — | ✓ | — | — |
| Controllable by external agents | ✓ | ✓ | ✓ | — | — |
| Data stored locally | ✓ | ✓ | ✓ | — | — |
| No login friction | ✓ | — | — | ✓ | ✓ |
| Daily-use browser | ✓ | — | — | ✓ | ✓ |
| Free | ✓ | ✓ | ✓ | — | — |

Two other categories try to solve the same problem. Browser automation frameworks like Browser-Use and Vercel's agent-browser are libraries the agent calls; they ship no browser of their own, so they need a separate one to drive and your logins rarely carry cleanly. AI browsers like ChatGPT Atlas and Perplexity Comet ship a built-in agent, and only that agent can drive the browser. ego lite is one browser, designed from the start for you and any agent you bring to share.


## Benchmarks

We benchmarked ego lite against Vercel's agent-browser on four complex browser automation tasks. ego lite finished each task up to 2.5× faster, with substantially fewer tokens. The harder the task, the bigger the gap. See the comparison below.

<div align="center">

<img src="docs/assets/ego-vs-agent-benchmark.png" alt="ego lite vs agent-browser, speed and cost across four tasks" width="100%" />

</div>

## Docs

Tutorials, the full tool reference, and integration guides live at [lite.ego.app/document/](https://lite.ego.app/document/).

## Reproducible development

The SDK is an ESM Node.js project. The supported runtime is pinned in
[`.nvmrc`](.nvmrc) (Node.js 22.14.0), and dependencies are locked by the root
[`package-lock.json`](package-lock.json). Install dependencies inside the
checkout; no global package installation is needed.

### Set up

With `nvm` installed, select the pinned runtime and install from the lockfile:

```bash
nvm install
nvm use
npm ci
npm run browser:install
```

On Windows, use an `nvm-windows` installation that supports the same `.nvmrc`
version, or install Node.js 22.14.0 directly. The root npm commands below work
from PowerShell and POSIX shells.

### Build and run

Build the SDK, security core, Playwright adapter, MCP service, and desktop
renderer:

```bash
npm run build
node package/ego-browser/dist/out/index.js --help
```

Start the local stdio MCP service:

```bash
npm run mcp
```

Targets are supplied as JSON through local environment configuration. Keep
internal hostnames and target lists out of version control:

```bash
EGO_SECURITY_TARGETS_JSON='[{"id":"staging-app","name":"Staging app","url":"https://staging.example.test","environment":"staging","authorized":true}]' npm run mcp
```

On PowerShell, set the variable before starting the service:

```powershell
$env:EGO_SECURITY_TARGETS_JSON='[{"id":"staging-app","name":"Staging app","url":"https://staging.example.test","environment":"staging","authorized":true}]'
npm run mcp
```

The repository CLI reads JavaScript from standard input. Run a script file with
the same command on every supported host:

```bash
node package/ego-browser/dist/out/index.js < ./path/to/script.js
```

For real browser work, load this bundle through the separately installed Ego
Lite CLI as described in [CONTRIBUTING.md](CONTRIBUTING.md). The open-source
checkout does not provide the native browser bindings.

### Test

After setup, the single cross-platform project test command is:

```bash
npm test
```

It runs the security core, browser adapter, MCP, Electron security-boundary,
and existing SDK tests offline after dependencies have been installed. On
Linux, `make test` is an equivalent convenience alias. The individual package
commands remain useful for focused debugging:

```powershell
npm run test --workspace @ego-lite/security-core
npm run test --workspace @ego-lite/browser-adapter
npm run test --workspace @ego-lite/mcp
npm run test --workspace @ego-lite/desktop
npm run test --workspace ego-browser-v2
```

The SDK test builds the bundle, checks Skill translation, typechecks TypeScript,
and runs the Node test suite without requiring the closed browser. The
additional build and validation checks are:

```bash
npm run sdk:build
npm run validate:site-skills
```

The real-browser E2E suite (`npm --prefix package/ego-browser run e2e`) is an
optional local gate and requires the separately installed Ego Lite application.

The headless MCP package has an offline-friendly test command:

```bash
npm run test --workspace @ego-lite/mcp
```

Run the stdio service locally with `npm run mcp`; it reads
one JSON-RPC request per line and writes one response per line. The default
provider is configured from `EGO_SECURITY_TARGETS_JSON` and lazily starts an
isolated Playwright page when an observation is requested. Browser telemetry is
metadata-only and redacted before it reaches MCP.

### Run the desktop console

Start the Electron/React development console:

```bash
npm run desktop:dev
```

Build the renderer and Electron main/preload bundles:

```bash
npm run desktop:build
```

The desktop renderer has no Node integration and receives only a narrow,
read-only preload bridge. The GUI uses the same local target configuration and
SQLite-backed provider as the MCP service.

### Build and deploy the headless image

The root [`Dockerfile`](Dockerfile) uses Node.js 22.14.0 and the committed root
npm lockfile. It installs the Playwright Chromium runtime and builds the
security core, browser adapter, standalone `ego-browser` CLI, and headless
newline-delimited JSON-RPC MCP service. MCP uses stdio rather than an HTTP
listener so clients can launch it as a subprocess.

```bash
docker build --tag ego-lite-headless:local .
docker run --rm -i ego-lite-headless:local < ./path/to/mcp-request.jsonl
docker run --rm --entrypoint node ego-lite-headless:local package/ego-browser/dist/out/index.js --help
```

The MCP service starts with read-only tools and keeps active DAST disabled by
default. Set the `EGO_MCP_*` values from [`.env.example`](.env.example) through
your deployment environment only when the corresponding policy and allowlist
are in place.

To publish it to a registry, replace the example registry and tag with your
own deployment target:

```bash
docker tag ego-lite-headless:local registry.example.invalid/ego-lite-headless:22.14.0
docker push registry.example.invalid/ego-lite-headless:22.14.0
```

The image does not contain the closed Ego Lite browser, browser profiles,
cookies, or credentials. Do not copy a real `.env` file into the image; use
environment injection at deployment time. `.env.example` contains placeholders
only.

## Community

- [Discord](https://discord.gg/5eGZVvHbTq), questions, setup help, and skill sharing
- [GitHub Discussions](https://github.com/citrolabs/ego-lite/discussions), ideas and longer threads
- [X/Twitter](https://x.com/ego_agent), updates and releases

## Star History

<a href="https://github.com/citrolabs/ego-lite/stargazers">
<!-- star-history:start -->
<!-- Generated daily by .github/workflows/star-history.yml and published to the
     'star-history' branch, because main's ruleset will not take a bot commit. -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/citrolabs/ego-lite/star-history/star-history-dark.svg">
  <img alt="Star history" src="https://raw.githubusercontent.com/citrolabs/ego-lite/star-history/star-history-light.svg">
</picture>
<!-- star-history:end -->
</a>

## License

The contents of this repository are released under the [MIT License](LICENSE). The ego lite browser is a separate, free download.
