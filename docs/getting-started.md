# Getting Started

## Prerequisites

- Node.js 22+
- pnpm 11+
- A running [qui](https://github.com/autobrr/qui) proxy instance connected to qBittorrent

## Install

```bash
git clone <your-repo-url>
cd requesting-site
pnpm install
```

## Configure

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

> Change the admin password immediately in production.

## Docker Quick Start

```bash
cp .env.example .env   # configure first
docker compose up -d --build
docker compose logs -f  # view logs
```

## Verify Installation

1. Login with `admin` / `admin`
2. Navigate to Browse — TMDB carousels should load
3. Check admin settings — service health checks should show green for qBittorrent and Prowlarr
4. Add a test torrent from the Browse page

## Next Steps

- [Configuration](./configuration.md) — All available environment variables
- [Architecture](./architecture.md) — How the project is structured
- [Deployment](./deployment.md) — Production Docker setup
