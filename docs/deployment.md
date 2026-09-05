# Deployment

## Docker

### Quick Start

```bash
cp .env.example .env   # configure first
docker compose -f docker-compose.sqlite.yml up -d              # SQLite
# docker compose -f docker-compose.postgres.yml up -d          # PostgreSQL
docker compose -f docker-compose.sqlite.yml logs -f            # view logs
```

The `lode` service uses the prebuilt `ghcr.io/nort1346/lode:latest` image (a `:nightly` tag with the latest dev build is also published daily). To build from source instead, uncomment the `#build: .` line in the compose file (requires Docker Desktop with >=4GB memory).

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
- pnpm 11.18.0 via corepack

### 2. `deps`
- Installs **production dependencies only** (with native addon build tools)
- Uses pnpm store cache mount

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
2. **Set `NUXT_SESSION_PASSWORD`** to a random 32+ character string
3. **Use PostgreSQL** for multi-user production
4. **Enable Redis** for caching (`NUXT_REDIS_URL`)
5. **Configure disk monitoring** with `NUXT_DISKS=/mnt/storage`
6. **Set up Discord webhook** for download notifications
7. **Configure Jellyfin** for media server sync

## Environment Variables

See [Configuration](./configuration.md) for the full list of environment variables.

## Logs

- **Docker logs**: `docker compose -f docker-compose.sqlite.yml logs -f lode`
- **Dozzle UI**: `http://localhost:8082`
- **Live logs**: Admin → Settings → Live Logs (SSE stream)
