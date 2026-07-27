ARG NODE_VERSION=24
ARG PNPM_VERSION=11.17.0
# ── Base ─────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# ── Deps (prod) ───────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    NODE_ENV=production pnpm install --frozen-lockfile --prod

# ── Build ─────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# NODE_ENV=production
# Requires Docker Desktop with ≥4GB memory allocated (Settings > Resources)
RUN NODE_OPTIONS=--max-old-space-size=4000 NODE_ENV=production pnpm run build \
    && find .output -name '*.map' -delete

# ── Runtime ───────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 ca-certificates gosu \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs appuser

WORKDIR /app

# .output
COPY --from=build  --chown=appuser:nodejs /app/.output                          ./.output

# node_modules (prebuilt binaries for better-sqlite3, sharp, @node-rs/bcrypt)
COPY --from=deps   --chown=appuser:nodejs /app/node_modules                     ./node_modules

# migrations and scripts
COPY --from=build  --chown=appuser:nodejs /app/server/database/migrations       ./server/database/migrations
COPY --from=build  --chown=appuser:nodejs /app/scripts/migrate.mjs              ./scripts/migrate.mjs

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 5757

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
