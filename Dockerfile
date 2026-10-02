# ---------- Etap 1: budowanie (frontend + bundle serwera) ----------
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ---------- Etap 2: tylko zależności produkcyjne ----------
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---------- Etap 3: obraz uruchomieniowy ----------
FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json schema.sql ./

# Katalog na lokalne dane (fallback JSON) należy do użytkownika bez uprawnień roota.
RUN mkdir -p /app/data && chown -R bun:bun /app/data

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/spellbook/status').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "dist/server.cjs"]
