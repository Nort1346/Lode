# StreamHub

![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxtdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-AGPL--3.0-orange)

Self-hosted streaming hub for managing torrent downloads. Browse movies and TV shows from TMDB, find torrents via Prowlarr, and download with one click.

## Features

| | |
|---|---|
| **Browse & Search** | TMDB carousels, spotlights, full-text search with genre filters |
| **Torrent Ranking** | Configurable 240-point scoring engine — resolution, language, seeders, source |
| **Private Trackers** | Cookie and login-based auth with auto-retry on session expiry |
| **User Management** | Per-user limits, session control, brute force protection, auto-expiration |
| **Jellyfin Sync** | Library detection, user CRUD sync, avatar upload, Live TV config |
| **Notifications** | SSE real-time, Discord webhooks, browser push (VAPID) |
| **Admin Panel** | Live logs, system status, disk monitoring, ranking config |
| **PWA** | Installable app with offline support and push notifications |

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 11+
- A running [qui](https://github.com/autobrr/qui) proxy instance connected to qBittorrent

```bash
git clone <your-repo-url>
cd requesting-site
pnpm install
cp .env.example .env    # then edit with your settings
pnpm dev                # opens at http://localhost:3000
```

Default admin: `admin` / `admin` — change immediately in production.

## Docker

```bash
cp .env.example .env        # configure first
docker compose up -d --build
docker compose logs -f       # view logs
```

| Service | Port | Purpose |
|---------|------|---------|
| `streamhub` | 3000 | Application |
| `redis` | 6379 | Caching (optional) |
| `flaresolverr` | 8191 | Cloudflare bypass (optional) |
| `postgres` | 5432 | Database (when `DB_DRIVER=postgres`) |
| `dozzle` | 8082 | Live log viewer |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Nuxt 4 + Nuxt UI 4 + Tailwind CSS v4 |
| Database | Drizzle ORM — SQLite (default) or PostgreSQL |
| Auth | nuxt-auth-utils (cookie sessions, bcrypt) |
| Integrations | TMDB, Prowlarr, qBittorrent, Jellyfin, Discord |
| Notifications | SSE + Web Push (VAPID) + Discord webhooks |
| PWA | @vite-pwa/nuxt (auto-update, Workbox) |

## Documentation

Full documentation lives in [`docs/`](./docs/):

- **[Getting Started](./docs/getting-started.md)** — Prerequisites, installation, first run
- **[Configuration](./docs/configuration.md)** — All environment variables and settings
- **[Architecture](./docs/architecture.md)** — Project structure, tech stack, composables
- **[Database](./docs/database.md)** — Schema (14 tables), migrations, SQLite vs PostgreSQL
- **[Deployment](./docs/deployment.md)** — Docker setup, production tips
- **[Features](./docs/features/)** — 13 feature guides (browse, torrents, users, Jellyfin, etc.)
- **[API Reference](./docs/api/)** — Complete endpoint documentation

## License

[AGPL-3.0](LICENSE) — Copyright (C) 2025 Nort
