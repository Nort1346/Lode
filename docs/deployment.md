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
| `docker-compose.plex.yml` | `plex` |
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
| `plex` | `plexinc/pms-docker` | 32400 | Media server (optional) |
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
| `plex-config` | Plex config | Media server state (claim, token, libraries) |
| `plex-transcode` | Plex transcode | Transcode scratch space |
| `postgres-data` | PostgreSQL data | Database persistence (postgres compose only) |

## Dockerfile Stages

### 1. `base`
- Node.js 24 trixie-slim (`NODE_VERSION=24` arg)
- pnpm 11.22.0 via corepack

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
- Entrypoint runs migrations → Jellyfin library setup → Plex library setup → drops privileges → starts app

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
gosu appuser node scripts/setup-plex.mjs
exec gosu appuser "$@"
```

## Production Tips

1. **Change admin password** immediately after first deploy
2. **Set `NUXT_SESSION_PASSWORD`** to a random 32+ character string
3. **Use PostgreSQL** for multi-user production
4. **Enable Redis** for caching (`NUXT_REDIS_URL`)
5. **Configure disk monitoring** with `NUXT_DISKS=/mnt/storage`
6. **Set up Discord webhook** for download notifications
7. **Configure Jellyfin and/or Plex** for media server sync

## Plex

The `plex` overlay runs `plexinc/pms-docker` on port 32400 with `./media` mounted read-write and named volumes for config and transcoding:

```bash
docker compose -f docker-compose.yml -f docker-compose.plex.yml up -d
```

1. **Claim the server** (first run only): create a token at <https://plex.tv/claim> and uncomment `PLEX_CLAIM` in `docker-compose.plex.yml`, or open `http://localhost:32400/web` and sign in. Lode needs a claimed server - an unclaimed PMS cannot manage users, which the Plex status endpoint reports as `myPlexSigninState`.
2. **Set the token**: `NUXT_PLEX_URL=http://plex:32400` and `NUXT_PLEX_TOKEN=<X-Plex-Token>` in `.env`. The token is account-wide (used against both the PMS and plex.tv) - do not share it.
3. **Libraries**: `scripts/setup-plex.mjs` runs on every container start and creates the `Movies` (`/media/Movies`) and `TV Shows` (`/media/Series`) sections when they are missing, re-adding a missing folder to an existing section. If your media lives elsewhere, create the sections manually in Plex - the script only wires up its own defaults.
4. **Users**: enable Plex sync in Admin → Settings → Sync Providers. New users get a managed home user on your Plex account plus a server share; no per-user Plex password is stored.

Plex share endpoints live in `PlexTvClient` (`server/utils/clients/plex.ts`) and are community-documented, so a plex.tv response-shape change is a one-file fix.

## Environment Variables

See [Configuration](./configuration.md) for the full list of environment variables.

## Logs

- **Docker logs**: `docker compose -f docker-compose.yml logs -f lode`
- **Dozzle UI**: `http://localhost:8082`
- **Live logs**: Admin → Settings → Live Logs (SSE stream)
