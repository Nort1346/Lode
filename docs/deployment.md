# Deployment

## Docker

### Quick Start

```bash
cp .env.example .env   # configure first
docker compose -f docker-compose.sqlite.yml up -d --build     # SQLite
# docker compose -f docker-compose.postgres.yml up -d --build # PostgreSQL
docker compose -f docker-compose.sqlite.yml logs -f            # view logs
```

### Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `streamhub` | Built from Dockerfile | 5757 | Main application |
| `redis` | `redis:7-alpine` | 6379 | Caching (optional) |
| `qbittorrent` | `linuxserver/qbittorrent` | 8080 | Torrent client |
| `prowlarr` | `linuxserver/prowlarr` | 9900 | Indexer manager |
| `jellyfin` | `jellyfin/jellyfin` | 8096 | Media server |
| `postgres` | `postgres:16-alpine` | 5432 | Database (optional) |
| `dozzle` | `amir20/dozzle:latest` | 8082 | Log viewer |

### Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| `./data` | `/app/.data` | SQLite database persistence |
| `./media` | `/media` | Media storage |
| `redis-data` | Redis data | Cache persistence |
| `postgres-data` | PostgreSQL data | Database persistence |

## Dockerfile Stages

### 1. `base`
- Node.js 22 bookworm-slim
- pnpm 11.5.2 via corepack
- `NODE_ENV=production`

### 2. `deps`
- Installs **production dependencies only** (with native addon build tools)
- Uses pnpm store cache mount

### 3. `build`
- Installs all dependencies (including devDependencies)
- Runs `pnpm run build` (Nuxt production build)
- Strips `.map` files from output

### 4. `runtime`
- Clean Node.js 22 bookworm-slim
- Installs runtime libraries: `libsqlite3-0`, `libssl3`, `gosu`
- Creates `appuser:nodejs` (1001:1001)
- Copies: `.output`, `node_modules`, migrations, scripts
- Entrypoint runs migrations → drops privileges → starts app

### Entrypoint

```sh
#!/bin/sh
set -e
mkdir -p /app/.data
chown -R appuser:nodejs /app/.data
mkdir -p /app/.output/public/avatars
chown -R appuser:nodejs /app/.output/public/avatars
gosu appuser node scripts/migrate.mjs
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

- **Docker logs**: `docker compose -f docker-compose.sqlite.yml logs -f streamhub`
- **Dozzle UI**: `http://localhost:8082`
- **Live logs**: Admin → Settings → Live Logs (SSE stream)
