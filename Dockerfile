# ── Build stage ──────────────────────────────────────────────
FROM node:22-bookworm AS build

RUN corepack enable && corepack prepare pnpm@11.5.2 --activate

WORKDIR /app

# Install native build deps for bcrypt + better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libsqlite3-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build


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

# Entrypoint script (runs as root first, then drops to appuser)
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# No USER directive — entrypoint handles privilege dropping

EXPOSE 3000

ENV NODE_ENV=production

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
