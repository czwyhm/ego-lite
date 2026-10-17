FROM node:22.14.0-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json tsconfig.json .nvmrc ./
RUN npm ci
COPY src ./src
COPY test ./test
COPY README.md ./README.md
RUN npm run build

CMD ["npm", "test"]
