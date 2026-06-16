# StreamHub

Torrent request manager for streaming services. Users submit magnet links, StreamHub communicates with qBittorrent via [qui](https://github.com/autobrr/qui) proxy, and an admin panel manages users with configurable download limits.

## Features

- **Torrent management** — submit magnet links or `.torrent` files, track progress, delete with disk cleanup
- **Background torrent sync** — continuous 10s server-side sync via Nitro plugin, no client dependency
- **Browse & search** — TMDB-powered movie/TV search with poster cards, detail pages, popular carousels
- **Torrent download from browse** — Prowlarr integration, one-click download with quality/seeder info
- **Polish private trackers** — Devil-Torrents / Polskie-Torrenty with cookie auth, guid-based download, per-user daily limits
- **Title requests** — users request movies/TV they want, admin accepts/rejects with notes
- **User system** — roles, daily download limits, active torrent limits, max size per user, private tracker limits
- **Jellyfin integration** — auto-notifies Jellyfin after torrent completes, configurable prep delay
- **Label system** — categorize downloads (movies, series, games, books, music)
- **Admin panel** — user CRUD, activate/deactivate, per-user limit configuration, request management
- **System dashboard** — live service health checks (qBittorrent, Prowlarr, Jellyfin, Redis) at `/admin/settings`
- **i18n** — Polish/English language switching, TMDB locale-aware results
- **Activity logs** — track user actions with action/user filtering
- **Skeleton loading** — loading skeletons on movie/TV detail pages
- **Redis caching** — cached TMDB/Prowlarr results with configurable TTL
- **Light/dark mode** — amber primary, glassmorphism dark theme, mobile responsive
- **Strict TypeScript** — ESLint with type-checked rules, Prettier, full typecheck

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Nuxt 4](https://nuxt.com) |
| UI | [Nuxt UI 4](https://ui.nuxt.com) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Database | SQLite (file-based) |
| Auth | [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils) |
| Cache | Redis ([ioredis](https://github.com/redis/ioredis)) |
| Movie data | [TMDB API](https://www.themoviedb.org/documentation/api) |
| Torrent search | [Prowlarr](https://prowlarr.com/) (Newznab-compatible) |
| i18n | [@nuxtjs/i18n v10](https://i18n.nuxtjs.org/) |
| Language | TypeScript 6 |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 11+
- A running [qui](https://github.com/autobrr/qui) instance connected to qBittorrent

### Install

```bash
git clone <your-repo-url>
cd requesting-site
pnpm install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env` with your settings. At minimum, set:

```env
NUXT_QUI_PROXY_URL=http://localhost:7476/proxy/YOUR_KEY
NUXT_SESSION_PASSWORD=your-random-32-char-string
NUXT_TMDB_API_KEY=your-tmdb-api-key
NUXT_PROWLARR_URL=http://127.0.0.1:9696
NUXT_PROWLARR_API_KEY=your-prowlarr-api-key
```

> For the Browse feature, set your TMDB API key and Prowlarr URL. Redis is optional but recommended for caching.

### Run

```bash
pnpm dev
```

Open `http://localhost:3000`. Default admin credentials: `admin` / `admin`.

> Change the admin password immediately in production.

## Docker

```bash
# Build and start
cp .env.example .env   # configure first
docker compose up -d --build

# View logs
docker compose logs -f

# Stop
docker compose down
```

The SQLite database is persisted in `./data` on the host.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `NUXT_QUI_PROXY_URL` | qui Client Proxy URL | — |
| `NUXT_SESSION_PASSWORD` | Session encryption key (32+ chars) | — |
| `NUXT_TMDB_API_KEY` | TMDB API v3 key (required for browse) | — |
| `NUXT_PROWLARR_URL` | Prowlarr base URL | `http://127.0.0.1:9696` |
| `NUXT_PROWLARR_API_KEY` | Prowlarr API key | — |
| `NUXT_REDIS_URL` | Redis connection URL (optional, enables caching) | — |
| `NUXT_JELLYFIN_URL` | Jellyfin server URL | — |
| `NUXT_JELLYFIN_API_KEY` | Jellyfin API key | — |
| `NUXT_JELLYFIN_PREP_SPEED_MB` | Prep speed in MB/s for delay calculation | `8` |
| `NUXT_SAVE_PATH_MOVIES` | qBittorrent save path for movies | `/mnt/storage/streaming/Movies` |
| `NUXT_SAVE_PATH_SERIES` | qBittorrent save path for series | `/mnt/storage/streaming/Series` |
| `NUXT_SAVE_PATH_GAMES` | qBittorrent save path for games | `/mnt/storage/streaming/Games` |
| `NUXT_SAVE_PATH_BOOKS` | qBittorrent save path for books | `/mnt/storage/streaming/Books` |
| `NUXT_SAVE_PATH_MUSIC` | qBittorrent save path for music | `/mnt/storage/streaming/Music` |
| `NUXT_TRACKER_DEVIL_ENABLED` | Enable Devil-Torrents tracker | `true` |
| `NUXT_TRACKER_DEVIL_COOKIE` | Devil-Torrents session cookie | — |
| `NUXT_TRACKER_POLSKIE_ENABLED` | Enable Polskie-Torrenty tracker | `true` |
| `NUXT_TRACKER_POLSKIE_COOKIE` | Polskie-Torrenty session cookie | — |
| `NUXT_TORRENT_SYNC_INTERVAL_MS` | Background torrent sync interval (ms) | `10000` |

## Scripts

```bash
pnpm dev          # Development server
pnpm build        # Production build
pnpm preview      # Preview production build
pnpm lint         # Run ESLint
pnpm lint:fix     # Auto-fix lint issues
pnpm format       # Format with Prettier
pnpm format:check # Check formatting
pnpm typecheck    # Run vue-tsc type checking
```

## License

[MIT](LICENSE)
