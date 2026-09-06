<p align="center">
  <img src="./public/logo_full.svg" alt="Lode" style="margin: 20px 0;">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxtdotjs&logoColor=white" alt="Nuxt">
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black" alt="Drizzle">
  <img src="https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/License-AGPL--3.0-orange" alt="License">
  <img src="https://github.com/Nort1346/Lode/actions/workflows/ci.yml/badge.svg" alt="CI">
  <a href="https://github.com/Nort1346/Lode/pkgs/container/lode">
    <img src="https://img.shields.io/badge/GHCR-nort1346%2Flode-2496ED?logo=docker&logoColor=white" alt="GHCR image">
  </a>
  <img src="https://img.shields.io/badge/i18n-en%20%7C%20pl%20%7C%20de%20%7C%20fr%20%7C%20es%20%7C%20pt--BR-3178C6" alt="i18n">
</p>

<p align="center">
  Self-hosted media hub - browse movies and TV shows from TMDB and download the best torrents with one click, straight to your media server. No Radarr or Sonarr required.
</p>

<p align="center">
  A self-hosted alternative to Seerr (Overseerr/Jellyseerr).
</p>

<p align="center">
  <img src="./public/demo.gif" alt="Lode demo" width="1000" />
</p>

## Get started

Paste this into your terminal and follow the guided setup:

**Linux / macOS**

```bash
curl -fsSL https://raw.githubusercontent.com/Nort1346/Lode/main/setup.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/Nort1346/Lode/main/setup.ps1 | iex
```

The script checks Docker, pulls the full stack, generates secrets, and walks you through each API key - unlike Seerr, which ships with a built-in TMDB key. Prefer manual setup? See [Quick Start](#quick-start) below.

## Features

| | |
|---|---|
| **Browse & Search** | TMDB carousels, spotlights, full-text search with genre filters |
| **Torrent Ranking** | Configurable weighted scoring engine (max 205 base points) - resolution, language, seeders, size, source, group |
| **Wishlist** | Save any movie/TV title for later from its detail page - personal list, no active request created |
| **Requests** | Users request a title when no torrents are available or they've hit a download limit; admin approves/rejects with an optional note; requester gets notified either way |
| **Manual Torrent Add** | Opt-in per user (admin-granted permission) - add any magnet link, .torrent file, or download URL directly to qBittorrent with a chosen category; not limited to movies/TV, works for any content |
| **Private Trackers** | Cookie and login-based auth with auto-retry on session expiry |
| **User Management** | Per-user limits, session control, brute force protection, auto-expiration, password generation |
| **Jellyfin Sync** | Library detection, user CRUD sync, avatar upload, Live TV config |
| **Notifications** | SSE real-time, Discord webhooks, browser push (VAPID) |
| **Admin Panel** | Live logs, system status, disk monitoring, ranking config |
| **PWA** | Installable app with offline support and push notifications |

## Preview

<p align="center">
  <img src="./public/preview.webp" alt="Lode preview" />
</p>

## Quick Start

### Option 1: Auto-Setup (Recommended)

Run the one-line command from [Get started](#get-started), then the guided script walks you through 14 steps:
1. Check prerequisites (Docker, Docker Compose)
2. Create `.env` from `.env.example`
3. Generate secrets (session password, tracker encryption key)
4. Choose database driver (SQLite or PostgreSQL)
5. Download the appropriate `docker-compose` file (`docker-compose.sqlite.yml` or `docker-compose.postgres.yml`)
6. Choose Lode image tag (`latest` or `nightly`)
7. Start infrastructure services (Redis, qBittorrent, Prowlarr, FlareSolverr, Jellyfin, Dozzle)
8. Get your **Jellyfin API key** (guided instructions)
9. Configure **qBittorrent WebUI + API key** (shows temp password, step-by-step)
10. Get your **Prowlarr API key** (guided instructions)
11. Get your **TMDB API key** (guided instructions)
12. Set **Discord webhook** (optional)
13. Pull Lode Docker image
14. Start Lode with health check

After setup, open **http://localhost:5757** and login with `admin`. The auto-generated password is shown in `docker compose -f <compose_file> logs lode`. Create users in Admin > Users.

### Option 2: Manual Setup

#### Prerequisites

- Node.js 24+
- pnpm 11+
- qBittorrent with WebUI API key enabled

```bash
git clone https://github.com/Nort1346/Lode.git
cd Lode
pnpm install
cp .env.example .env    # then edit with your settings
pnpm dev                # opens at http://localhost:5757
```

Default admin: `admin` - the password is auto-generated on first start and printed to the terminal (look for `Admin password:`). Create users in Admin > Users.

## Docker

```bash
cp .env.example .env        # configure first
# Choose one:
docker compose -f docker-compose.sqlite.yml up -d     # SQLite (default)
# docker compose -f docker-compose.postgres.yml up -d # PostgreSQL
docker compose -f docker-compose.sqlite.yml logs -f   # view logs
```

The compose files use the prebuilt `ghcr.io/nort1346/lode:latest` image. To build from source instead, uncomment the `#build: .` line in the `lode` service.

Lode replaces Radarr and Sonarr entirely - it pulls candidate torrents from Prowlarr and sends the selected one straight to qBittorrent, which is why no *arr download services appear in the stack.

| Service | Port | Purpose |
|---------|------|---------|
| `lode` | 5757 | Application |
| `qbittorrent` | 8080 | Torrent client |
| `prowlarr` | 9900 | Indexer manager |
| `flaresolverr` | 8191 | CAPTCHA solver (optional) |
| `jellyfin` | 8096 | Media server (optional) |
| `redis` | 6379 | Caching (optional) |
| `dozzle` | 8082 | Live log viewer |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Nuxt 4 + Nuxt UI 4 + Tailwind CSS v4 |
| Database | Drizzle ORM - SQLite (default) or PostgreSQL |
| Auth | nuxt-auth-utils (cookie sessions, bcrypt) |
| Integrations | TMDB, Prowlarr, qBittorrent, Jellyfin, Discord |
| Notifications | SSE + Web Push (VAPID) + Discord webhooks |
| PWA | @vite-pwa/nuxt (auto-update, Workbox) |

## Documentation

Full documentation lives in [`docs/`](./docs/):

- **[Getting Started](./docs/getting-started.md)** - Prerequisites, installation, first run
- **[Configuration](./docs/configuration.md)** - All environment variables and settings
- **[Architecture](./docs/architecture.md)** - Project structure, tech stack, composables
- **[Database](./docs/database.md)** - Schema (13 tables), migrations, SQLite vs PostgreSQL
- **[Deployment](./docs/deployment.md)** - Docker setup, production tips
- **[Features](./docs/features/)** - 13 feature guides (browse, torrents, users, Jellyfin, etc.)
- **[API Reference](./docs/api/)** - Complete endpoint documentation

## Why Lode

Unlike request-only tools (Overseerr, Seerr) that stop at "request and forget", Lode owns the full loop:

- **One-click download** - picks the best torrent via a configurable ranking engine and sends it straight to qBittorrent.
- **Private tracker support** - cookie/login auth with auto-retry on session expiry, not just public indexers.
- **Built-in user system** - per-user limits, session control, brute-force protection, and auto-expiration. No external auth provider required.
- **Jellyfin-native** - library detection, user sync, and avatar management out of the box.
- **Real-time everything** - SSE live logs, browser push (VAPID), and Discord notifications.
- **Self-hosted first** - Docker Compose stack, SQLite by default (PostgreSQL optional), no cloud dependency.

## Lode vs Seerr

[Seerr](https://github.com/seerr-team/seerr) (formerly Overseerr / Jellyseerr) is a request management layer that sits on top of Radarr and Sonarr plus Jellyfin/Emby/Plex. Users request media, and the *arr apps fetch it automatically. Lode replaces Radarr, Sonarr, and the request layer with a single app that gives you direct control over torrent selection.

The key difference is *who controls the download*:

Comparison based on Seerr's public docs as of August 2026 - open an issue if anything is outdated or inaccurate.

| | Lode | [Seerr](https://github.com/seerr-team/seerr) |
|---|---|---|
| **Primary flow** | Browse TMDB → rank torrents → send to qBittorrent | Request → *arr (Radarr/Sonarr) fetches |
| **Torrent control** | Direct qBittorrent, one-click, manual pick | Delegated to *arr, no manual torrent pick |
| **Torrent ranking** | Built-in weighted scoring engine (max 205 base points) | Not built-in (delegated to *arr) |
| **Private trackers** | Cookie/login auth with auto-retry | Handled via *arr indexers |
| **User management** | Built-in: per-user limits, brute-force, sessions, expiry | Media-server login plus local email/password users |
| **Request limits** | No quotas, one active request per title per user | Per-user quotas per media type (global defaults + overrides) |
| **Wishlist / Watchlist** | Personal save-for-later list | Per-user watchlist, admin blocklist, Plex watchlist auto-request |
| **Real-time logs** | SSE live logs in admin panel | No in-app log viewer |
| **Notifications** | SSE + Discord + browser push (VAPID) | 10 agents incl. email, Discord, Slack, Telegram, Web Push |
| **PWA** | Installable with offline support | Web Push support, mobile-responsive UI |
| **Media servers** | Jellyfin (Emby planned) | Jellyfin, Emby, Plex |
| **Auto-setup** | One-command `setup.sh` / `setup.ps1` (Docker + guided keys) | Docker Compose + docs, no guided setup |
| **Translations** | EN, PL, DE, FR, ES, PT-BR (community) | Crowdsourced via Weblate (25+ languages) |
| **Best for** | Owning the full download loop + custom user tiers | *arr users wanting request management on top |

Lode gives your users the ability to browse and download content themselves -- no admin intervention needed. Each user gets their own limits, session control, and a torrent ranking engine that picks the best source automatically.

## Roadmap

- [ ] Emby support (additional media server)
- [ ] Prowlarr indexer management (add/configure indexers from Lode admin)
- [ ] Home Assistant integration (webhook, sensors, automations)

Got an idea? [Open a feature request](https://github.com/Nort1346/Lode/issues/new?template=feature_request.yml).

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for setup, testing, and PR guidelines.

## License

[AGPL-3.0](LICENSE) - Copyright (C) 2026 Nort

## Support

If you find Lode useful, consider giving the repo a star - it helps the project get discovered.
