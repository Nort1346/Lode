# StreamHub

Torrent request manager for streaming services. Users submit magnet links, torrent URLs, or `.torrent` files. StreamHub communicates with qBittorrent via [qui](https://github.com/autobrr/qui) proxy. Admin panel manages users with configurable download limits, disk space monitoring, and Discord notifications.

## Features

### Torrent Submission (3 methods)

Users can add torrents via three input methods on `/dashboard/submit`:

**1. Magnet Link**
- Paste a `magnet:?xt=urn:btih:...` link
- Normalized automatically (`magnet://` → `magnet:`)
- Passed directly to qBittorrent via `qui.addTorrent()`
- Metadata resolved by qBittorrent after adding

**2. Download URL**
- Paste an HTTP/HTTPS URL pointing to a `.torrent` file (e.g. from Prowlarr)
- Backend validates with GET request (3s timeout, `redirect: 'manual'`)
- Handles magnet: redirects from Prowlarr (302 → `magnet:?xt=...`)
- Rejects HTML responses (login pages, error pages)
- If fetch fails (DNS, SSL, timeout), passes URL to qBittorrent anyway
- qBittorrent downloads the `.torrent` file and starts the download
- Stored in DB as `download:<url>`

**3. .torrent File Upload**
- Select a `.torrent` file from disk (max 5MB, client-side + server-side validation)
- Read as base64 via `FileReader.readAsDataURL()`
- Decoded to Buffer on server, uploaded to qBittorrent via `qui.addTorrentFile()`
- Stored in DB as `file:<fileName>`

**Common validation (all 3 methods):**
- Auth check (401 if not logged in)
- Active torrent limit check (429 if exceeded, admin bypass)
- Daily download limit check (429 if exceeded, admin bypass)
- Save path validation (must be movies/series/games/music/books)
- Disk space pre-check (507 if insufficient)
- Post-add: max torrent size check (413 if too large, auto-deletes torrent)
- Post-add: disk space re-check (507 if exceeded, auto-deletes + creates `disk_full` record)
- TMDB poster fetch (if tmdbId provided)
- Activity log recorded

### Browse & Search

**Carousels on `/browse`:**
- Trending (mixed movies + TV, from TMDB `/trending/all/week`)
- Popular Movies (from TMDB `/movie/popular`)
- Popular TV Shows (from TMDB `/tv/popular`)
- Top Rated (from TMDB `/movie/top_rated`)

**Search:**
- Full-text search across movies and TV shows
- Filter by type: All / Movies / TV Shows
- Locale-aware results (Polish/English)

**Movie detail (`/browse/movie/:id`):**
- Backdrop image with gradient overlay
- Poster, title, original title, year, runtime, rating, genres
- Overview, IMDB ID
- "Request This" button (sends request to admin)
- Available torrents from Prowlarr with 100-point scoring system
- One-click download per torrent
- Dev debug mode for admins (shows indexer, magnetLink, downloadUrl, guid)

**TV show detail (`/browse/tv/:id`):**
- Season selector dropdown
- Per-episode torrent listing
- Season pack highlighting (purple badge)
- Same scoring and download system as movies

**Torrent ranking (100-point system):**
| Factor | Points |
|--------|--------|
| Resolution: 1080p | 30 |
| Resolution: 4K/2160p | 15 |
| Resolution: 720p | 15 |
| Language: PL Dubbing | 20 |
| Language: PL Lektor | 20 |
| Language: PL Napisy | 15 |
| Language: English | 10 |
| Seeders (scaled) | 0-25 |
| Size sweet spot (2-15GB movies) | 0-15 |
| Source: Remux | 10 |
| Source: BluRay | 9 |
| Source: WEB-DL | 8 |
| Known release groups | 5 |
| Title relevance (word match) | -20 to +15 |
| Year match | +10 |
| Full title match | +10 |

Top 3 results marked as "recommended" (amber star badge).

### Download Management

**Dashboard (`/dashboard`):**
- 3 stat cards: Active Torrents, Downloads Today, Completed Today
- Active downloads list with real-time progress (3s polling interval)
- Progress bar with gradient colors based on torrent health
- Quality badges: dead (red), poor (amber), slow (cyan), ok (none)
- Delete button with confirmation modal (ConfirmDialog + useOverlay)
- Poster thumbnails (TMDB w185, 48×72px mobile, 80×120px desktop)

**Downloads page (`/dashboard/downloads`):**
- Full list of all user's downloads
- Same real-time progress and quality badges
- Status badges with colors: downloading (cyan), completed (green), pending (amber), failed (red), disk_full (orange), paused (zinc), removed (zinc)
- Prep-time countdown for completed downloads (estimates when Jellyfin will be ready)
- Responsive layout (narrow on mobile, wider on tablet+)

**Download statuses:**
| Status | Meaning |
|--------|---------|
| `downloading` | Active download in qBittorrent |
| `completed` | Download finished, available in Jellyfin |
| `pending` | Added but not yet active in qBittorrent |
| `failed` | Torrent not found in qBittorrent + downloadedBytes < sizeBytes |
| `paused` | Paused in qBittorrent |
| `removed` | Deleted by user |
| `disk_full` | Auto-deleted because disk ran out of space |

### Disk Space Blocking

**Configuration:**
```env
NUXT_DISKS=/mnt/storage/streaming,/host-root
NUXT_MIN_FREE_SPACE_GB=7
NUXT_DISK_SPACE_CHECK_ENABLED=true
```

**How it works:**

1. Uses `fs.statfsSync()` to get real-time filesystem stats for each configured mount path
2. Returns `DiskStatus`: path, totalBytes, freeBytes, usedBytes, usedPercent, available

**Pre-download check (before adding torrent):**
- Runs in `add.post.ts` and `download.post.ts`
- If `freeBytes - torrentSize < minFreeSpaceGb × 1024³` → blocks with 507
- Error message hides disk path from non-admin users

**Post-download check (after qBittorrent adds torrent):**
- Runs after qBittorrent returns torrent metadata (actual size known)
- If `torrent.size > disk.freeBytes` → auto-deletes torrent from qBittorrent
- Creates a DB record with `status: 'disk_full'`
- Throws 507 with torrent size and free space info

**Admin settings page (`/admin/settings`):**
- Shows all configured disks with progress bars
- Free/used/total space display
- OK/Low/Unavailable badges
- Configurable minimum required space

**Docker setup:**
- Host root mounted read-only: `/:/host-root:ro`
- Allows checking free space on any filesystem from inside the container
- Storage mount: `./data:/app/.data` (SQLite DB)

### User System

**Roles:**
- `user` - standard user, subject to all limits
- `admin` - bypasses active torrent limit, daily download limit, private tracker limit. Does NOT bypass disk space checks or max torrent size

**Per-user limits:**
| Limit | Default | Description |
|-------|---------|-------------|
| `daily_download_limit` | 5 | Max downloads per day (resets at midnight) |
| `active_torrent_limit` | 3 | Max concurrent downloading torrents |
| `max_torrent_size_gb` | 20 | Max size per torrent in GB |
| `private_tracker_limit` | 5 | Max daily downloads from Polish private trackers |

**Authentication:**
- `nuxt-auth-utils` for session management (cookie-based)
- bcrypt password hashing (12 rounds)
- Session cookie: `secure: false` for HTTP access
- Default admin: `admin` / `admin` (created on first run)

### Polish Private Trackers

**Supported:** Devil-Torrents, Polskie-Torrenty

**Configuration:**
```env
NUXT_TRACKER_DEVIL_ENABLED=true
NUXT_TRACKER_DEVIL_COOKIE=PHPSESSID=your_session_id
NUXT_TRACKER_POLSKIE_ENABLED=true
NUXT_TRACKER_POLSKIE_COOKIE=PHPSESSID=your_session_id
```

**How it works:**
1. Prowlarr indexes these trackers, returns results with `indexer: 'Devil-Torrents'` etc.
2. These trackers use GUID URLs (not magnet links) - `.torrent` file must be fetched directly
3. Backend detects `isPolishTracker = POLISH_TRACKERS.includes(indexer)`
4. Fetches `.torrent` from tracker's GUID URL using `got-scraping` (Chrome TLS impersonation)
5. Passes cookie via `Cookie` header for authentication
6. Validates response: first byte must be `0x64` (bencode 'd'), not `0x3c` (HTML = bad cookie)
7. Uploads `.torrent` buffer to qBittorrent via `qui.addTorrentFile()`
8. Stored in DB as `guid:<url>`

**Separate daily limit:** `privateTrackerLimit` (default 5/day) - counted by downloads where `magnetLink` starts with `guid:`. Admins bypass this limit.

### Discord Webhook Notifications

**Configuration:**
```env
NUXT_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/ID/TOKEN
```

**When triggered:** On download completion (detected by background torrent sync)

**Message format (Components V2):**
- Title heading (from TMDB or label)
- Poster image (TMDB or fallback `poster_not_found.png`)
- Overview description (truncated to 2000 chars)
- Separator
- TMDB details: genres, runtime, rating, release date
- Separator
- Info: size, category (Movies/Series/etc), downloaded by username
- Technical metadata parsed from torrent name: resolution, source, language, codec

**Locale support:** Polish (pl) or English (en), configurable from admin settings page via `discord_locale` setting.

### Jellyfin Integration

**Configuration:**
```env
NUXT_JELLYFIN_URL=http://localhost:8096
NUXT_JELLYFIN_API_KEY=your_api_key
NUXT_JELLYFIN_PREP_SPEED_MB=8
```

**How it works:**
1. After torrent completion, waits for prep delay (file copy speed simulation)
2. Notifies Jellyfin to scan library via `notifyMediaUpdated()`
3. Configurable prep speed (default 8 MB/s)

### Request System

**User flow:**
1. Browse to movie/TV detail page
2. Click "Request This" button
3. Request created with status `pending`
4. Duplicate prevention (can't request same title twice)

**Admin flow:**
1. View all requests at `/admin/requests`
2. Filter by status: All / Pending / Accepted / Rejected
3. Accept or reject with optional note
4. Paginated table with user, title, type, status, date

### Activity Logs

**Tracked actions:** login, login_failed, logout, register, torrent_add, torrent_delete, user_update, user_delete

**Features:**
- Paginated table with time, user, action, details, IP, user agent
- Filter by action type and user
- IP resolution from: CF-Connecting-IP, X-Forwarded-For, X-Real-IP
- Auto-cleanup: logs older than 90 days deleted on startup

### System Dashboard (`/admin/settings`)

**Service health checks (6 services):**
| Service | Check method |
|---------|-------------|
| qBittorrent | qui proxy version endpoint |
| Prowlarr | API ping |
| Jellyfin | System info endpoint |
| Redis | PING command |
| Discord | Webhook HEAD request |
| FlareSolverr | Version endpoint |

Each shows: Online/Offline badge, latency in ms, Not Configured if env var missing.

**Live logs viewer:**
- Hidden terminal icon at the bottom of `/admin/settings`
- Click to toggle - opens a 400px terminal panel with live logs
- SSE (Server-Sent Events) streaming from server ring buffer (last 500 lines)
- Color-coded by level: INFO (green), WARN (amber), ERROR (red)
- Pause/Resume, Clear, Download as .txt
- Auto-scrolls to newest logs
- Admin-only access (403 for non-admins)

### i18n

- Polish (pl, default) and English (en)
- `@nuxtjs/i18n` v10 with `no_prefix` strategy
- `restructureDir: '.'` in nuxt.config.ts
- TMDB locale-aware: `pl` → `pl-PL`, `en` → `en-US`
- Language selector in mobile header and desktop sidebar
- Uses `setLocale()` from `useI18n()` for locale switching
- Google Translate prevention: `<meta name="google" content="notranslate">`

### Technical Features

**Pino logger:**
- `server/utils/logger.ts` - pino + pino-pretty (dev: colorized, prod: JSON)
- `createLogger(module)` returns a wrapper that logs to pino (stdout/Docker/Dozzle) AND to a ring buffer (500 lines) for SSE live streaming
- Modules: Download, Add, FlareSolverr, Discord, TorrentSync, DB

**Background torrent sync:**
- Nitro plugin `server/plugins/torrent-sync.ts` runs every 10s (configurable via `NUXT_TORRENT_SYNC_INTERVAL_MS`)
- Extracted sync logic into `server/utils/torrent-sync.ts`
- Polls qBittorrent for active download progress
- Detects completion via 4 signals: `completion_on > 0`, `downloaded >= size`, `progressPct >= 99.9`, state in completedStates
- Triggers Discord webhook on completion
- Triggers Jellyfin library scan after prep delay

**Redis caching (optional):**
- TMDB search: 24h TTL
- TMDB details: 7d TTL
- Prowlarr results: 30min TTL
- Popular/trending: 6h TTL
- Graceful fallback if Redis unavailable

**Prowlarr result deduplication:**
- Two-pass: first by `downloadUrl` (exact match), then by `title+size`
- Keeps highest seeders in each group
- Runs before caching

**Torrent file validation (Polish trackers):**
- Binary validation: torrent files start with `0x64` (d = bencode dictionary)
- HTML starts with `0x3c` (<)
- Response read as `arrayBuffer()` not `text()`

**ESLint strict TypeScript:**
- `projectService: true`
- `@typescript-eslint/no-explicit-any`
- `no-unsafe-*` rules
- `no-floating-promises`
- `strict-boolean-expressions`
- Server files: `'no-console': 'off'`
- App files: `'no-console': 'warn'`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Nuxt 4](https://nuxt.com) v4.4.8 |
| UI | [Nuxt UI 4](https://ui.nuxt.com) v4.8.2 |
| CSS | [Tailwind CSS](https://tailwindcss.com) v4.3.1 |
| ORM | [Drizzle ORM](https://orm.drizzle.team) v0.45.2 |
| Database | SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3)) v12.10.1 |
| Auth | [nuxt-auth-utils](https://github.com/atinoux/nuxt-auth-utils) v0.5.29 |
| Cache | Redis ([ioredis](https://github.com/redis/ioredis)) v5.11.1 |
| Password hashing | [bcrypt](https://github.comkelektiv/node.bcrypt.js) v6.0.0 |
| Movie data | [TMDB API](https://www.themoviedb.org/documentation/api) v3 |
| Torrent search | [Prowlarr](https://prowlarr.com/) (Newznab-compatible) |
| Torrent client | [qBittorrent](https://www.qbittorrent.org/) via [qui](https://github.com/autobrr/qui) proxy |
| Cloudflare bypass | [got-scraping](https://github.com/sindresorhus/got-scraping) v4.2.1 (Chrome TLS impersonation) |
| Notifications | [discord.js](https://discord.js.org/) REST v2.6.1 + Buildlers v1.14.1 |
| Icons | [Iconify](https://iconify.design/) (Lucide + Simple Icons) |
| i18n | [@nuxtjs/i18n](https://i18n.nuxtjs.org/) v10.4.0 |
| Language | TypeScript v6.0.3 |
| Linting | ESLint v10.5.0 + typescript-eslint v8.61.0 |
| Formatting | Prettier v3.8.4 |
| Package manager | pnpm v11.5.2 |

## Quick Start

### Prerequisites

- Node.js 22+
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

**Docker services:**
| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `streamhub` | Custom (multi-stage) | 3000 | The application |
| `redis` | `redis:7-alpine` | - | Caching (optional) |
| `flaresolverr` | `ghcr.io/flaresolverr/flaresolverr` | 8191 | Cloudflare bypass (optional) |
| `dozzle` | `amir20/dozzle:latest` | 8082 | Live container log viewer |

**Volumes:**
- `./data:/app/.data` - SQLite database persistence
- `/mnt/storage/streaming:/mnt/storage/streaming:ro` - Media storage (read-only)
- `/:/host-root:ro` - Host root for disk space checks (read-only)
- `redis_data:/data` - Redis persistence

**Dockerfile stages:**
1. **Build:** `node:22-bookworm` with pnpm, native deps (python3, make, g++, libsqlite3-dev)
2. **Runtime:** `node:22-slim` with gosu for privilege dropping, runs as non-root `appuser`

## Configuration

### Required

| Variable | Description |
|----------|-------------|
| `NUXT_QUI_PROXY_URL` | qui Client Proxy URL (e.g. `http://localhost:7476/proxy/YOUR_KEY`) |
| `NUXT_SESSION_PASSWORD` | Session encryption key (32+ chars) |
| `NUXT_TMDB_API_KEY` | TMDB API v3 key (required for browse) |
| `NUXT_PROWLARR_URL` | Prowlarr base URL |
| `NUXT_PROWLARR_API_KEY` | Prowlarr API key |

### Optional - Paths

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_SAVE_PATH_MOVIES` | `/mnt/storage/streaming/Movies` | qBittorrent save path for movies |
| `NUXT_SAVE_PATH_SERIES` | `/mnt/storage/streaming/Series` | qBittorrent save path for series |
| `NUXT_SAVE_PATH_GAMES` | `/mnt/storage/streaming/Games` | qBittorrent save path for games |
| `NUXT_SAVE_PATH_BOOKS` | `/mnt/storage/streaming/Books` | qBittorrent save path for books |
| `NUXT_SAVE_PATH_MUSIC` | `/mnt/storage/streaming/Music` | qBittorrent save path for music |

### Optional - Integrations

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_REDIS_URL` | - | Redis connection URL (enables caching) |
| `NUXT_JELLYFIN_URL` | - | Jellyfin server URL |
| `NUXT_JELLYFIN_API_KEY` | - | Jellyfin API key |
| `NUXT_JELLYFIN_PREP_SPEED_MB` | `8` | Prep speed in MB/s for delay calculation |
| `NUXT_DISCORD_WEBHOOK_URL` | - | Discord webhook for download notifications |
| `NUXT_FLARESOLVERR_URL` | - | FlareSolverr URL for Cloudflare bypass |

### Optional - Polish Trackers

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_TRACKER_DEVIL_ENABLED` | `true` | Enable Devil-Torrents tracker |
| `NUXT_TRACKER_DEVIL_COOKIE` | - | Devil-Torrents session cookie |
| `NUXT_TRACKER_POLSKIE_ENABLED` | `true` | Enable Polskie-Torrenty tracker |
| `NUXT_TRACKER_POLSKIE_COOKIE` | - | Polskie-Torrenty session cookie |

### Optional - Disk Space

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_DISKS` | - | Comma-separated mount paths for disk checks |
| `NUXT_MIN_FREE_SPACE_GB` | `7` | Minimum free GB required per disk |
| `NUXT_DISK_SPACE_CHECK_ENABLED` | `true` | Enable/disable disk space checks |

### Optional - Other

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_TORRENT_SYNC_INTERVAL_MS` | `10000` | Background torrent sync interval (ms) |

## Database Schema

**Engine:** SQLite via better-sqlite3 + Drizzle ORM, stored at `.data/app.db`

### `users`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | text (PK) | - | UUID |
| `username` | text (unique) | - | Login name |
| `password` | text | - | bcrypt hash |
| `role` | text | `user` | `user` or `admin` |
| `is_active` | integer (bool) | `true` | Account enabled |
| `daily_download_limit` | integer | `5` | Max downloads per day |
| `active_torrent_limit` | integer | `3` | Max concurrent torrents |
| `max_torrent_size_gb` | integer | `20` | Max torrent size in GB |
| `private_tracker_limit` | integer | `5` | Max daily private tracker downloads |
| `downloads_today` | integer | `0` | Counter (legacy) |
| `downloads_reset_at` | text | - | Last reset timestamp |
| `created_at` | text | - | ISO timestamp |

### `downloads`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | text (PK) | - | UUID |
| `user_id` | text (FK) | - | Owner |
| `label` | text | `''` | User-provided label |
| `torrent_name` | text | `''` | qBittorrent torrent name |
| `magnet_link` | text | - | `magnet:...`, `download:<url>`, `file:<name>`, or `guid:<url>` |
| `save_path` | text | - | Category: movies/series/games/books/music |
| `status` | text | `pending` | Status enum |
| `torrent_hash` | text | - | qBittorrent hash |
| `progress` | real | `0` | Progress percentage (0-100) |
| `eta_seconds` | integer | `0` | ETA in seconds |
| `download_speed` | integer | `0` | Current download speed (bytes/s) |
| `upload_speed` | integer | `0` | Current upload speed (bytes/s) |
| `size_bytes` | integer | `0` | Total torrent size |
| `downloaded_bytes` | integer | `0` | Bytes downloaded |
| `num_seeds` | integer | `0` | Current seeders |
| `num_leechs` | integer | `0` | Current leechers |
| `created_at` | text | - | ISO timestamp |
| `completed_at` | text | - | Completion timestamp |
| `tmdb_id` | integer | - | TMDB media ID |
| `media_type` | text | - | `movie` or `tv` |
| `poster_url` | text | - | TMDB poster URL |

### `settings`
| Column | Type | Description |
|--------|------|-------------|
| `key` | text (PK) | Setting name |
| `value` | text | Setting value |

Current keys: `discord_locale` (pl/en)

### `activity_logs`
| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | UUID |
| `user_id` | text | User ID (nullable for failed logins) |
| `username` | text | Username |
| `action` | text | Action type |
| `details` | text | JSON details |
| `ip` | text | Client IP |
| `user_agent` | text | Client user agent |
| `created_at` | text | ISO timestamp |

### `requests`
| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | UUID |
| `user_id` | text (FK) | Requester |
| `username` | text | Requester username |
| `media_type` | text | `movie` or `tv` |
| `media_id` | integer | TMDB media ID |
| `media_title` | text | Title |
| `media_poster` | text | TMDB poster URL |
| `status` | text | `pending`/`accepted`/`rejected` |
| `note` | text | Admin note (on reject) |
| `created_at` | text | ISO timestamp |

## API Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | No | Login with username/password |
| POST | `/api/auth/logout` | Yes | Clear session |
| POST | `/api/auth/register` | Admin | Create new user |
| GET | `/api/auth/me` | Yes | Get current session |

### Torrents
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/torrents/add` | Yes | Add torrent (magnet/file/URL) |
| GET | `/api/torrents/list` | Yes | List downloads (admin sees all) |
| GET | `/api/torrents/:id` | Yes | Get single download |
| DELETE | `/api/torrents/:id` | Yes | Delete download |

### Browse
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/browse/search` | Yes | Search TMDB |
| GET | `/api/browse/popular` | Yes | Popular movies + TV |
| GET | `/api/browse/trending` | Yes | Trending content |
| GET | `/api/browse/top-rated` | Yes | Top rated movies |
| GET | `/api/browse/movie/:id` | Yes | Movie details |
| GET | `/api/browse/movie/:id/torrents` | Yes | Prowlarr search for movie |
| GET | `/api/browse/tv/:id` | Yes | TV show details |
| GET | `/api/browse/tv/:id/torrents` | Yes | Prowlarr search for TV |
| GET | `/api/browse/tv/:id/season/:season` | Yes | Season episodes + torrents |
| POST | `/api/browse/download` | Yes | Download from browse (11-step pipeline) |

### Requests
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/requests/post` | Yes | Submit media request |
| GET | `/api/requests/mine` | Yes | Check if user requested a title |
| GET | `/api/requests/list` | Admin | List all requests |
| PATCH | `/api/requests/:id` | Admin | Accept/reject request |

### Admin
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/system-status` | Admin | Service health checks |
| GET | `/api/admin/disk-status` | Admin | Disk space status |
| GET | `/api/admin/users` | Admin | List all users |
| POST | `/api/admin/users` | Admin | Create user |
| PUT | `/api/admin/users/:id` | Admin | Update user |
| DELETE | `/api/admin/users/:id` | Admin | Delete user |
| GET | `/api/admin/logs` | Admin | Activity logs |
| GET | `/api/admin/logs-stream` | Admin | Live logs SSE stream |
| GET | `/api/admin/discord-locale` | Admin | Get Discord locale |
| PUT | `/api/admin/discord-locale` | Admin | Set Discord locale |
| GET | `/api/admin/settings` | Admin | App settings |

## Scripts

```bash
pnpm dev          # Development server
pnpm build        # Production build
pnpm preview      # Preview production build
pnpm lint         # Run ESLint
pnpm lint:fix     # Auto-fix lint issues
pnpm format       # Format with Prettier
pnpm format:check # Check formatting
pnpm typecheck    # Run Nuxt typecheck
```

## Path Aliases

| Alias | Resolves to |
|-------|-------------|
| `#server` | `./server/` |
| `#db` | `./server/database/` |
| `#utils` | `./server/utils/` |

## License

[AGPL-3.0](LICENSE) - Copyright (C) 2025 Nort
