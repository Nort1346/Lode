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
  <strong>A simple self-hosted media hub for Jellyfin, with support for more media servers planned.</strong><br>
  Find a movie or TV show, compare available releases, choose one, and track the download in real time.
</p>

<p align="center">
 <strong>Easy to run. Easy to use.</strong>
</p>

<p align="center">
  <img src="./public/demo.gif" alt="Lode demo" width="1000">
</p>

## How it works

1. **Find** a movie or TV show
2. **Compare** available releases
3. **Choose** the one you want
4. **Track** the download in real time
5. **Watch** it in your media server

## Get started

Go from a fresh machine to a working media setup in minutes with the guided setup.

**Linux / macOS**

```bash
curl -fsSL https://raw.githubusercontent.com/Nort1346/Lode/main/setup.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/Nort1346/Lode/main/setup.ps1 | iex
```

The setup checks Docker, generates the required secrets, and guides you through service configuration and API keys.

## Why Lode

Lode keeps the media workflow simple without requiring the full *arr stack.

- Users can compare and choose releases themselves
- Discovery, release selection, and downloading in one workflow
- Guided setup with minimal configuration

## Features

| Feature | Description |
|---|---|
| **Browse & Search** | Discover movies and TV shows through TMDB |
| **Release Ranking** | Compare available releases using configurable scoring |
| **Direct Download** | Choose a release and send it to qBittorrent |
| **Requests & Wishlist** | Save titles for later, or request them when no torrents are available or a download limit is reached |
| **Manual Torrent Add** | Optional direct torrent and magnet support |
| **Private Trackers** | Support for authenticated indexers |
| **User Management** | Per-user permissions, sessions, and account expiry |
| **Download Controls** | Limit active downloads, daily downloads, download size, and private tracker usage |
| **Media Servers** | Jellyfin support, with more planned |
| **Notifications** | Real-time updates, Discord, and browser push |
| **Guided Setup** | One-command setup with Docker and service configuration |
| **PWA** | Install Lode as a standalone web app |

## Release ranking

Lode ranks available releases using configurable weighted criteria such as resolution, language, seeders, size, source, and release group.

Users can see the score and the factors behind it before choosing a release.

## Who is Lode for?

Lode is for people who want a simple self-hosted media setup without having to learn or maintain the full *arr stack.

If you already rely on advanced Radarr/Sonarr automation, Lode is not a direct replacement. It intentionally offers a simpler workflow.

## Lode vs Seerr

[Seerr](https://github.com/seerr-team/seerr) is a request and media management layer that works with Sonarr and Radarr.

Lode handles media discovery, release selection, and downloading directly in one workflow.

|                            | Lode                   | Seerr                |
| -------------------------- | ---------------------- | -------------------- |
| **Media discovery**        | Built in               | Built in             |
| **Release selection**      | User chooses directly  | Via *arr             |
| **Release ranking**        | Built in               | Via *arr             |
| **Download**               | Direct to qBittorrent  | Via Sonarr/Radarr    |
| **Radarr/Sonarr required** | No                     | Yes                  |
| **Media servers**          | Jellyfin, more planned | Jellyfin, Emby, Plex |

The main difference is who controls the release selection and download flow. Lode lets users see the available releases and choose what gets downloaded without adding Radarr or Sonarr to the setup.

## Preview

<p align="center">
  <img src="./public/preview.webp" alt="Lode preview">
</p>

## Quick start

### Manual setup

Requirements:

- Node.js 24+
- pnpm 11+
- qBittorrent with WebUI API key enabled
- Prowlarr
- TMDB (optional API key - Lode ships a built-in shared key, so most users can skip this)

```bash
git clone https://github.com/Nort1346/Lode.git
cd Lode
pnpm install
cp .env.example .env # then edit with your settings
pnpm dev
```

Open `http://localhost:5757`.

Default user: `admin`. The auto-generated password is printed in the terminal on first start. Create users in Admin > Users.

### Docker

The default image is:

```text
ghcr.io/nort1346/lode:latest
```

Lode supports SQLite and PostgreSQL. The stack uses a base compose file plus optional overlays:

| Service | Overlay | Port | Purpose |
|---------|---------|------|---------|
| `lode` | base | 5757 | Application |
| `redis` | base | 6379 | Caching (optional) |
| `qbittorrent` | `docker-compose.qbittorrent.yml` | 8080 | Torrent client |
| `prowlarr` | `docker-compose.prowlarr.yml` | 9900 | Indexer manager |
| `flaresolverr` | `docker-compose.flaresolverr.yml` | 8191 | CAPTCHA solver (optional) |
| `jellyfin` | `docker-compose.jellyfin.yml` | 8096 | Media server (optional) |
| `postgres` | `docker-compose.postgres.yml` | 5432 | Database (optional) |
| `dozzle` | `docker-compose.dozzle.yml` | 8082 | Live log viewer (optional) |

## Tech stack

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

- [Getting Started](./docs/getting-started.md) - setup, prerequisites, first run
- [Configuration](./docs/configuration.md) - environment variables and settings
- [Deployment](./docs/deployment.md) - Docker setup and production tips
- [Architecture](./docs/architecture.md) - project structure and data flow
- [API Reference](./docs/api/) - endpoint documentation

## Roadmap

- [ ] Plex support (additional media server)
- [ ] Emby support (additional media server)
- [ ] Prowlarr indexer management (add/configure indexers from Lode admin)
- [ ] Home Assistant integration (webhook, sensors, automations)

Have an idea? [Open a feature request](https://github.com/Nort1346/Lode/issues/new?template=feature_request.yml).

## Contributing

Contributions are welcome.

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for development setup and contribution guidelines.

## License

[AGPL-3.0](LICENSE) © 2026 Nort1346

## Support

If you find Lode useful, consider giving the repository a star.
