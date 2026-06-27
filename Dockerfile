# ── Deploy stage (flat production node_modules) ────────────
FROM node:22-bookworm AS deploy

ARG PNPM_VERSION=11.5.2
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libsqlite3-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm deploy --prod --filter . /deploy


# ── Build stage ──────────────────────────────────────────────
FROM node:22-bookworm AS build

ARG PNPM_VERSION=11.5.2
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libsqlite3-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build
RUN find .output -name '*.map' -delete


# ── Runtime stage ───────────────────────────────────────────
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-0 libssl3 ca-certificates gosu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 appuser

# Copy only the production build output
COPY --from=build --chown=appuser:nodejs /app/.output ./.output

# Copy flat prod node_modules (no .pnpm store)
COPY --from=deploy --chown=appuser:nodejs /deploy/node_modules ./node_modules

# Copy migration files + script (needed for explicit migration step)
COPY --from=build --chown=appuser:nodejs /app/server/database/migrations ./server/database/migrations
COPY --from=build --chown=appuser:nodejs /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build --chown=appuser:nodejs /app/scripts/migrate-sqlite-to-pg.mjs ./scripts/migrate-sqlite-to-pg.mjs

# Entrypoint script (runs as root first, then drops to appuser)
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# No USER directive - entrypoint handles privilege dropping

EXPOSE 3000

ENV NODE_ENV=production

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
