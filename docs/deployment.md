# Deployment

## Docker

### Quick Start

```bash
cp .env.example .env   # configure first
docker compose -f docker-compose.yml up -d                                     # SQLite (base)
# docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d    # PostgreSQL
docker compose -f docker-compose.yml logs -f lode                              # view logs
```

The `lode` service uses the prebuilt `ghcr.io/nort1346/lode:latest` image (a `:nightly` tag with the latest dev build is also published daily). To build from source instead, uncomment the `#build: .` line in the base compose file (requires Docker Desktop with >=4GB memory).

### Modular compose files

The stack is split into a base file and per-service overlays so you deploy only what you need. Combine the base with any overlays you want using repeated `-f` flags:

| File | Adds |
|------|------|
| `docker-compose.yml` | `lode` + `redis` (always) |
| `docker-compose.postgres.yml` | `postgres` (switches the database driver) |
| `docker-compose.qbittorrent.yml` | `qbittorrent` |
| `docker-compose.prowlarr.yml` | `prowlarr` |
| `docker-compose.jellyfin.yml` | `jellyfin` |
| `docker-compose.flaresolverr.yml` | `flaresolverr` |
| `docker-compose.dozzle.yml` | `dozzle` |

Example (full local stack on PostgreSQL):

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml \
  -f docker-compose.qbittorrent.yml -f docker-compose.prowlarr.yml \
  -f docker-compose.jellyfin.yml up -d
```

The [auto-setup script](../README.md#quick-start) selects these overlays for you and saves the choice to `.lode-setup` so re-runs prefill the prompts.

### Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `lode` | `ghcr.io/nort1346/lode:latest` | 5757 | Main application |
| `redis` | `redis:7-alpine` | 6379 | Caching (optional) |
| `qbittorrent` | `lscr.io/linuxserver/qbittorrent` | 8080 | Torrent client |
| `prowlarr` | `lscr.io/linuxserver/prowlarr` | 9900 | Indexer manager |
| `flaresolverr` | `ghcr.io/flaresolverr/flaresolverr` | 8191 | Cloudflare bypass (optional) |
| `jellyfin` | `jellyfin/jellyfin` | 8096 | Media server (optional) |
| `postgres` | `postgres:16-alpine` | 5432 | Database (postgres compose only) |
| `dozzle` | `amir20/dozzle:latest` | 8082 | Log viewer (optional) |

### Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| `./data` | `/app/.data` | SQLite database + app data persistence |
| `./media` | `/media` | Media storage |
| `lode-avatars` | `/app/.output/public/avatars` | User avatar images |
| `redis-data` | Redis data | Cache persistence |
| `qbittorrent-config` | qBittorrent config | Torrent client state |
| `prowlarr-config` | Prowlarr config | Indexer manager state |
| `jellyfin-config` | Jellyfin config | Media server state |
| `jellyfin-cache` | Jellyfin cache | Media server cache |
| `postgres-data` | PostgreSQL data | Database persistence (postgres compose only) |

## Dockerfile Stages

### 1. `base`
- Node.js 24 trixie-slim (`NODE_VERSION=24` arg)
- pnpm 12.4.1 via corepack (matches `packageManager`)

### 2. `deps`
- Installs **production dependencies only** (with native addon build tools)
- Uses pnpm store cache mount
- Bare install stages run `postinstall` via `scripts/nuxt-prepare.mjs`, which skips `nuxt prepare` when `nuxt.config.ts` is absent (avoids the simple-git 4 ESM error)

### 3. `build`
- Installs all dependencies (including devDependencies)
- Runs `pnpm run build` (Nuxt production build, 4GB heap)
- Strips `.map` files from output

### 4. `runtime`
- Same Node.js 24 trixie-slim image as `base`
- Installs runtime libraries: `libssl3`, `ca-certificates`, `gosu`
- Creates `appuser:nodejs` (1001:1001)
- Copies: `.output`, `node_modules` (prebuilt native binaries), migrations, scripts
- `NODE_ENV=production`, exposes 5757
- Entrypoint runs migrations → Jellyfin library setup → drops privileges → starts app
- The container `CMD` is `node scripts/start.mjs`, which loads `.env`, maps deprecated `NUXT_SESSION_PASSWORD` to `NUXT_APP_SECRET` with a warning, and then imports the built server

### Entrypoint

```sh
#!/bin/sh
set -e
mkdir -p /app/.data
chown -R appuser:nodejs /app/.data
mkdir -p /app/.output/public/avatars
chown -R appuser:nodejs /app/.output/public/avatars
gosu appuser node scripts/migrate.mjs
gosu appuser node scripts/setup-jellyfin.mjs
exec gosu appuser "$@"
```

## Production Tips

1. **Change admin password** immediately after first deploy
2. **Set `NUXT_APP_SECRET`** to a random 32+ character string (`NUXT_SESSION_PASSWORD` still works as a deprecated fallback)
3. **Use PostgreSQL** for multi-user production
4. **Enable Redis** for caching (`NUXT_REDIS_URL`)
5. **Configure disk monitoring** with `NUXT_DISKS=/mnt/storage`
6. **Set up Discord webhook** for download notifications
7. **Configure Jellyfin** for media server sync

## Troubleshooting

### A torrent sits at 0% and never finds a source

qBittorrent never got the `.torrent` metadata. It usually means the URL Lode passed along
(or that was typed into qBittorrent) points at an address qBittorrent cannot reach:

- `localhost` / `127.0.0.1` inside a container is that container, not the host. Prowlarr
  builds the download links from the address Lode used, so `NUXT_PROWLARR_URL=http://localhost:9900`
  produces links that only the host can fetch.
- With the whole stack in compose, keep `NUXT_PROWLARR_URL=http://prowlarr:9696` and
  `NUXT_QBITTORRENT_URL=http://qbittorrent:8080` (the `.env.example` defaults).
- With a hybrid setup (Lode via `pnpm dev` on the host, Prowlarr/qBittorrent in Docker), use the
  host's LAN IP (`http://192.168.1.50:9900`) so both sides can reach it.

Lode fetches the `.torrent` itself for browse downloads and only passes the URL as a fallback,
so the metadata usually arrives even when qBittorrent cannot resolve the indexer host. Remove the
stuck torrent and add it again after fixing the URL - it will not recover on its own.

### qBittorrent reports "connection refused" in the Lode logs

`NUXT_QBITTORRENT_URL` is not reachable from the Lode process. Inside compose use
`http://qbittorrent:8080`; for Lode on the host use `http://localhost:8080`.

## Environment Variables

See [Configuration](./configuration.md) for the full list of environment variables.

## Logs

- **Docker logs**: `docker compose -f docker-compose.yml logs -f lode`
- **Dozzle UI**: `http://localhost:8082`
- **Live logs**: Admin → Settings → Live Logs (SSE stream)
