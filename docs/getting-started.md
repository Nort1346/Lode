# Getting Started

## Prerequisites

- Node.js 22+
- pnpm 11+
- Docker Desktop with **≥4GB memory** allocated (Settings > Resources > Memory)

## Install

```bash
git clone https://github.com/Nort1346/StreamHub.git
cd StreamHub
pnpm install
```

## Configure

```bash
cp .env.example .env
```

Edit `.env` with your settings. At minimum, set:

```env
NUXT_QBITTORRENT_URL=http://localhost:8080
NUXT_QBITTORRENT_API_KEY=your-qbittorrent-api-key
NUXT_SESSION_PASSWORD=your-random-32-char-string
NUXT_TMDB_API_KEY=your-tmdb-api-key
NUXT_PROWLARR_URL=http://127.0.0.1:9900
NUXT_PROWLARR_API_KEY=your-prowlarr-api-key
NUXT_TRACKER_ENCRYPTION_KEY=replace_me_with_64_hex_chars
```

Generate the encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Run

```bash
pnpm dev
```

Open `http://localhost:5757`. Default admin credentials: `admin` / `admin`.

> There is no public registration. Login as admin and create users in Admin > Users.

## Docker Quick Start

> **Important:** Docker Desktop must have ≥4GB memory allocated (Settings > Resources > Memory). Recommended: 6GB.

```bash
cp .env.example .env   # configure first
docker compose -f docker-compose.sqlite.yml up -d --build     # SQLite
# docker compose -f docker-compose.postgres.yml up -d --build # PostgreSQL
docker compose -f docker-compose.sqlite.yml logs -f            # view logs
```

## Verify Installation

1. Login with `admin` / `admin`
2. Navigate to Browse - TMDB carousels should load
3. Check admin settings - service health checks should show green for qBittorrent and Prowlarr
4. Create a test user in Admin > Users
5. Add a test torrent from the Browse page

## Next Steps

- [Configuration](./configuration.md) - All available environment variables
- [Architecture](./architecture.md) - How the project is structured
- [Deployment](./deployment.md) - Production Docker setup
