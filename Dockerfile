# Reproducible headless CLI/MCP image. The closed Ego Lite browser application
# is intentionally not part of this repository or image.
FROM node:22.14.0-bookworm-slim

WORKDIR /workspace

# Copy every workspace manifest before sources so dependency installation is
# reproducible and cacheable from the committed root lockfile.
COPY package.json package-lock.json .nvmrc ./
COPY package/ego-browser/package.json package/ego-browser/package-lock.json package/ego-browser/tsconfig.json ./package/ego-browser/
COPY packages/security-core/package.json packages/security-core/package-lock.json packages/security-core/tsconfig.json ./packages/security-core/
COPY packages/browser-adapter/package.json packages/browser-adapter/tsconfig.json ./packages/browser-adapter/
COPY packages/mcp/package.json packages/mcp/package-lock.json packages/mcp/tsconfig.json ./packages/mcp/
COPY apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/tsconfig.json ./apps/desktop/

RUN npm ci --ignore-scripts \
  && npx playwright install --with-deps chromium

COPY package/ego-browser/scripts ./package/ego-browser/scripts
COPY package/ego-browser/src ./package/ego-browser/src
COPY package/ego-browser/skill-body ./package/ego-browser/skill-body
COPY packages/security-core/src ./packages/security-core/src
COPY packages/mcp/src ./packages/mcp/src
COPY skills/ ./skills/

# Normalize a possible CRLF checkout before the generated Skill is parsed.
RUN node -e "const fs=require('node:fs'); const p='package/ego-browser/skill-body/SKILL.md'; fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/\\r\\n/g,'\\n'))"

RUN npm run build --workspace @ego-lite/security-core \
  && npm run build --workspace @ego-lite/browser-adapter \
  && npm run build --workspace @ego-lite/mcp \
  && npm run sdk:build

ENV NODE_ENV=production
ENV EGO_MCP_ENABLE_DAST=false

# MCP is the default container process. The standalone SDK remains available by
# overriding the entrypoint with node and package/ego-browser/dist/out/index.js.
ENTRYPOINT ["node", "packages/mcp/dist/src/index.js"]
