ARG NODE_VERSION=24
ARG PNPM_VERSION=11.18.0

# ── Base: Node + pnpm via corepack ─────────────────────────────
FROM node:${NODE_VERSION}-trixie-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# ── Deps: production dependencies only (used later at runtime) ─
FROM base AS deps
WORKDIR /app

# apt cache mount speeds up rebuilds; build tools needed for native modules
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends build-essential python3

COPY --link package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --link scripts/prepare.mjs ./scripts/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    NODE_ENV=production pnpm install --frozen-lockfile --prod

# ── Build: inherits deps, adds devDependencies and builds the app ─
FROM deps AS build
WORKDIR /app

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY --link . .

# Requires Docker Desktop with >=4GB memory allocated (Settings > Resources)
RUN NODE_OPTIONS=--max-old-space-size=4000 NODE_ENV=production pnpm run build \
    && find .output -name '*.map' -delete

# ── Runtime: minimal image, only what's needed to run the server ─
FROM node:${NODE_VERSION}-trixie-slim AS runtime

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        libssl3 ca-certificates gosu \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs appuser

WORKDIR /app

# Built server output
COPY --link --from=build --chown=1001:1001 /app/.output ./.output

# Production node_modules (prebuilt native binaries  trixie-slim ships GLIBC 2.40+)
COPY --link --from=deps --chown=1001:1001 /app/node_modules ./node_modules

# Migrations and helper scripts needed at runtime
COPY --link --from=build --chown=1001:1001 /app/server/database/migrations ./server/database/migrations
COPY --link --from=build --chown=1001:1001 /app/scripts ./scripts

COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 5757

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
