# StreamHub

Torrent request manager for streaming services. Users submit magnet links, StreamHub communicates with qBittorrent via [qui](https://github.com/autobrr/qui) proxy, and an admin panel manages users with configurable download limits.

## Features

- **Torrent management** — submit magnet links, track progress, delete with disk cleanup
- **User system** — roles, daily download limits, active torrent limits, max size per user
- **Jellyfin integration** — auto-notifies Jellyfin after torrent completes, configurable prep delay
- **Label system** — categorize downloads (movies, series, games, books, music)
- **Admin panel** — user CRUD, activate/deactivate, per-user limit configuration
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
```

### Run

```bash
pnpm dev
```

Open `http://localhost:3000`. Default admin credentials: `admin` / `admin`.

> Change the admin password immediately in production.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `NUXT_QUI_PROXY_URL` | qui Client Proxy URL | — |
| `NUXT_SESSION_PASSWORD` | Session encryption key (32+ chars) | — |
| `NUXT_JELLYFIN_URL` | Jellyfin server URL | — |
| `NUXT_JELLYFIN_API_KEY` | Jellyfin API key | — |
| `NUXT_JELLYFIN_PREP_SPEED_MB` | Prep speed in MB/s for delay calculation | `8` |
| `NUXT_SAVE_PATH_MOVIES` | qBittorrent save path for movies | `/mnt/storage/streaming/Movies` |
| `NUXT_SAVE_PATH_SERIES` | qBittorrent save path for series | `/mnt/storage/streaming/Series` |
| `NUXT_SAVE_PATH_GAMES` | qBittorrent save path for games | `/mnt/storage/streaming/Games` |
| `NUXT_SAVE_PATH_BOOKS` | qBittorrent save path for books | `/mnt/storage/streaming/Books` |
| `NUXT_SAVE_PATH_MUSIC` | qBittorrent save path for music | `/mnt/storage/streaming/Music` |

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
