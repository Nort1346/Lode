# StreamHub

Self-hosted streaming hub for managing torrent downloads. Browse movies and TV shows from TMDB, find torrents via Prowlarr, and download with one click. Admin panel with user management, per-user limits, private tracker support, and Discord notifications.

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
- Admin queue priority: admin torrents are moved to top of qBittorrent download queue via `/api/v2/torrents/topPrio`
- TMDB poster fetch (if tmdbId provided)
- Activity log recorded

### Browse & Search

**Carousels on `/browse`:**
- Trending (mixed movies + TV, from TMDB `/trending/all/week`) with TMDB logo title treatments
- Popular Movies (from TMDB `/movie/popular`)
- Popular TV Shows (from TMDB `/tv/popular`)
- Top Rated (from TMDB `/movie/top_rated`)

Carousels use the reusable `MediaCarousel` component with scroll arrows (hover-reveal), skeleton loading, and `MediaCarouselItem` type (includes `logoUrl`).

**Search:**
- Full-text search across movies and TV shows
- Filter by type: All / Movies / TV Shows
- Locale-aware results (Polish/English)

**Movie detail (`/browse/movie/:id`):**
- Backdrop image with gradient overlay
- Poster, title, original title, year, runtime, rating, genres
- Overview, IMDB ID
- "Request This" button (sends request to admin) with cursor pointer
- "Add to Wishlist" button (heart icon, toggle add/remove, cursor pointer)
- Available torrents from Prowlarr with 240-point scoring system
- One-click download per torrent
- Private tracker badge (`isPrivate`) and percentage display
- Dev debug mode for admins (shows indexer, magnetLink, downloadUrl, guid)

**TV show detail (`/browse/tv/:id`):**
- Season selector dropdown
- Per-episode torrent listing with indexer name
- Season pack highlighting (purple badge)
- "Request This" and "Add to Wishlist" buttons (same as movie)
- Same scoring and download system as movies

**Torrent ranking (240-point system):**
| Factor | Points |
|--------|--------|
| Seeders (logarithmic) | 0–100 (`11 * log2(seeders + 1)`) |
| Resolution: 4K/2160p | 40 |
| Resolution: 1080p | 30 |
| Resolution: 720p | 20 |
| Language: PL Dubbing | 30 |
| Language: PL Lektor | 30 |
| Language: PL Napisy | 25 |
| Language: English | 15 |
| Size sweet spot | 0–20 |
| Source: Remux | 10 |
| Source: BluRay | 9 |
| Source: WEB-DL | 8 |
| Known release groups | 5 |
| Title relevance (word match %) | 0–15 |
| Year match | +10 |
| Full title match | +10 |

`SCORE_MAX = 240`. Displayed as percentage (`score / 240 * 100`), color: green ≥80%, amber ≥60%. Top 3 results marked as "recommended" (amber star badge).

Season packs are scored through `rankTorrents()` with adjusted size thresholds (<5GB=3, 5-20GB=7, 20-50GB=10, 50-100GB=8, >100GB=3).

### Download Management

**Dashboard (`/dashboard`):**
- 3 stat cards: Active Torrents, Downloads Today, Completed Today
- Active downloads list with real-time progress (3s polling interval)
- Progress bar with gradient colors based on torrent health
- Quality badges: dead (red), poor (amber), slow (cyan), ok (none)
- Delete button with confirmation dialog (ConfirmDialog + useOverlay)
- Poster thumbnails (TMDB w185, 48×72px mobile, 80×120px desktop)
- Hero banner: auto-rotating (8s) random trending movie with TMDB logo title treatment (fallback to plain text), backdrop image (original quality), crossfade transition (800ms), locale-aware overview, type badge, rating badge, CTA button. Responsive heights: 380px (mobile) → 480px (sm) → 560px (md) → 640px (lg) → 720px (xl)
- 3 carousels below hero: Trending, Popular Movies, Popular TV (using reusable `MediaCarousel` component)
- "My Requests" carousel showing user's pending requests with status badges (pending, accepted, rejected)
- Navigation: Dashboard, Browse, Submit, Downloads, **Wishlist**

**Downloads page (`/dashboard/downloads`):**
- Server-side paginated list of all user's downloads (10 per page, `UPagination` with `showEdges` and `sibling-count=2`)
- Same real-time progress and quality badges
- Status badges with colors: downloading (cyan), completed (green), pending (amber), failed (red), disk_full (orange), paused (zinc), removed (zinc)
- Prep-time countdown for completed downloads (estimates when Jellyfin will be ready)
- Responsive layout (narrow on mobile, wider on tablet+)
- Poster thumbnails on download tiles

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

**Configuration (env vars or admin settings):**
```env
NUXT_DISKS=D:\,E:\
NUXT_MIN_FREE_SPACE_GB=7
NUXT_DISK_SPACE_CHECK_ENABLED=true
```

`minFreeSpaceGb` and `diskSpaceCheckEnabled` are stored in the `settings` DB table. Env vars serve as initial defaults. Changes from the admin settings panel take effect immediately without restart.

**How it works:**

1. Uses `fs.statfsSync()` to get real-time filesystem stats for each configured mount path
2. Returns `DiskStatus`: path, totalBytes, freeBytes, usedBytes, usedPercent, available
3. Unavailable disks (path error, permission denied) are treated as **blocked** — downloads cannot proceed

**Pre-download check (before adding torrent):**
- Runs in `add.post.ts` and `download.post.ts`
- Accounts for torrent size: `freeBytes - torrentSize < minFreeSpaceGb × 1024³`
- If insufficient → blocks with 507
- Unavailable disk → blocks with 507 (not silently skipped)
- Admin bypass does NOT apply to disk space checks
- Error message hides disk path from non-admin users

**Post-download check (after qBittorrent adds torrent):**
- Runs after qBittorrent returns torrent metadata (actual size known)
- If `torrent.size > disk.freeBytes` → auto-deletes torrent from qBittorrent
- Creates a DB record with `status: 'disk_full'`
- Throws 507 with torrent size and free space info

**Dangerous file auto-rejection (browse downloads):**
- After torrent is added and metadata fetched, checks all files in the torrent
- Blocks download if any file matches dangerous extensions: `.exe`, `.msi`, `.bat`, `.cmd`, `.sh`, `.ps1`, `.com`, `.vbs`, `.js`, `.jar`, `.apk`, `.dmg`, `.scr`, `.pif`, `.reg`, `.dll`, `.sys`, `.cpl`, `.hta`, `.lnk`, `.inf`, `.url`, `.wsh`, `.wsf`, `.xbap`, `.msh`, `.msh1`, `.msh2`, `.mshxml`, `.ps1xml`, `.psc1`, `.psc2`
- Only applies to `/api/browse/download` (Movies/Series catalog), NOT to `/api/torrents/add` (manual submission)
- Uses `getTorrentFiles(hash)` from qBittorrent API to inspect file list before download starts

**Admin settings panel (`/admin/settings`):**
- Toggle: enable/disable disk space check (USwitch)
- Input: minimum required free space in GB (UInput number)
- Disk status display: progress bars, free/used/total space, OK/Low/Unavailable badges
- Toast notifications on changes
- Changes take effect immediately (DB-backed)

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

**Fresh user data from DB:**
Limits are fetched directly from the `users` table via `getFreshUser(userId)`, not from the stale session cookie. This ensures admin changes to limits take effect immediately without requiring re-login.

**Authentication:**
- `nuxt-auth-utils` for session management (cookie-based)
- bcrypt password hashing (12 rounds)
- Session cookie: `secure: false` for HTTP access
- Default admin: `admin` / `admin` (created on first run)

### Brute Force Protection

**IP-only blocking** (no account lockout - admin can never be locked out).

**How it works:**
1. Middleware (`server/middleware/brute-force.ts`) intercepts POST `/api/auth/login`
2. Checks if IP is in blocked list (in-memory cache with auto-expiry)
3. If blocked → 403 "Too many failed login attempts"
4. On login failure → records attempt in `login_attempts` table
5. When attempts exceed threshold within time window → blocks IP

**Configuration (admin panel `/admin/brute-force`):**
| Setting | Default | Description |
|---------|---------|-------------|
| `maxAttemptsPerIp` | 5 | Max failed attempts before IP block |
| `ipBlockDurationMinutes` | 60 | How long IP stays blocked |
| `windowMinutes` | 15 | Time window for counting attempts |

**Admin UI (`/admin/brute-force`):**
- 2 stat cards: Blocked IPs count, Total login attempts
- Blocked IPs table with IP, attempts, blocked since, unblock button
- Config form with 3 inputs (maxAttempts, blockDuration, windowMinutes)
- Toast notifications for all actions
- Activity logs: `brute_force_config_update`, `brute_force_unblock_ip`

### Custom Private Trackers

**Admin-managed via `/admin/trackers`.**

**Two auth methods:**
- **Cookie**: Paste session cookie from browser DevTools (Application → Cookies)
- **Login**: Auto-detect login form fields (HTML parsing), POST credentials, capture Set-Cookie headers. Works with most PHP trackers.

**Tracker types (`trackerType`):**
| Type | Description |
|------|-------------|
| `guid` | Cookie/login scraping with retry on HTML response |
| `counting` | No auth required, just counts toward private tracker limit |

**Features:**
- AES-256-GCM encryption for tracker passwords in DB (`NUXT_TRACKER_ENCRYPTION_KEY`)
- Session caching (1h) with auto-retry on HTML detection (expired session)
- Auto-login flow in `prowlarr.ts` - `getTrackerCookieConfig()` is async
- Test login endpoint (`POST /api/admin/trackers/[id]/test-login`) probes without saving
- `got-scraping` for Cloudflare bypass (Chrome TLS impersonation)
- Redirect cookie collection after login POST (follows 302 to collect additional Set-Cookie)

**How private tracker downloads work:**
1. Prowlarr indexes these trackers, returns results with `indexer: 'Devil-Torrents'` etc.
2. These trackers use GUID URLs (not magnet links) - `.torrent` file must be fetched directly
3. Backend detects `isPrivateTracker(indexer)` and `getTrackerType(indexer) === 'guid'`
4. Fetches `.torrent` from tracker's GUID URL using `got-scraping` (Chrome TLS impersonation)
5. Passes cookie via `Cookie` header for authentication
6. Validates response: first byte must be `0x64` (bencode 'd'), not `0x3c` (HTML = bad cookie)
7. On HTML response: clears session cache, re-logins, retries once
8. Uploads `.torrent` buffer to qBittorrent via `qui.addTorrentFile()`
9. Stored in DB as `guid:<url>` with `isPrivate: true`

**Separate daily limit:** `privateTrackerLimit` (default 5/day) - counted by downloads where `isPrivate = true` (including removed/failed). Admins bypass this limit.

### Discord Webhook Notifications

**Configuration:**
```env
NUXT_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/ID/TOKEN
```

**When triggered:**
- `MEDIA_DOWNLOAD` — on download completion (detected by background torrent sync)
- `MEDIA_PENDING` — when a user submits a new request (sent to admin channel)

**Message format (Components V2):**
- TextDisplay mention: `<@discord_id>` (if user has Discord ID set and mentions are enabled)
- Title heading (from TMDB or label)
- MediaGallery (poster/backdrop with fallback `poster-not-found.png`)
- Overview description (truncated to 2000 chars)
- Separator
- TMDB details: genres, runtime, rating, premiere date
- Separator
- Info: size, category (Movies/Series/etc), downloaded by username
- Technical metadata parsed from torrent name: resolution, source, language, codec

**MEDIA_PENDING notification content:**
- Title (from TMDB)
- Media type (movie/TV)
- Requester username
- Optional user note (if provided when requesting)

**User mentions:**
- Each user can have a `discord_id` set in admin panel (`/admin/users`)
- When enabled, download notifications mention the user who requested the download
- Configurable from admin settings: toggle on/off (`discord_mentions_enabled`)
- Uses Discord Components V2 TextDisplay component (not `content` field)
- Mention only sent if user has a Discord ID AND mentions are enabled globally

**Locale support:** Polish (pl) or English (en), configurable from admin settings page via `discord_locale` setting. Decoupled from UI locale.

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
3. Optionally add a message to admin (user note)
4. Request created with status `pending`
5. Duplicate prevention (can't request same title twice)

**Request statuses:**
| Status | Description |
|--------|-------------|
| `pending` | Awaiting admin review |
| `accepted` | Admin approved the request |
| `rejected` | Admin declined the request |

**My Requests (`/dashboard`):**
- Dedicated section showing the user's own requests
- Each request displays a status badge (pending = amber, accepted = green, rejected = red)
- Shows title, media type, date, and admin response note (if any)

**Admin flow:**
1. View all requests at `/admin/requests`
2. Filter by status: All / Pending / Accepted / Rejected
3. Accept or reject with optional admin response note
4. Paginated table with user, title, type, status, date

### Wishlist

**Purpose:** Save titles to download later — useful when daily limit is reached or when browsing on mobile.

**User flow:**
1. Browse to movie/TV detail page
2. Click "Add to Wishlist" (heart icon, toggles between add/remove)
3. Title saved with TMDB metadata (mediaType, mediaId, title, poster)
4. View saved titles at `/dashboard/wishlist`
5. From wishlist: click card → navigate to detail page → pick torrent → download
6. Remove from wishlist via hover action or detail page toggle

**Duplicate prevention:** Unique index on `(user_id, media_type, media_id)` prevents saving the same title twice.

**Detail page button:** Heart icon button next to "Request This". Changes to "In Wishlist" when saved. Available on both movie (`/browse/movie/:id`) and TV (`/browse/tv/:id`) detail pages.

**Wishlist page (`/dashboard/wishlist`):**
- Grid of poster cards (responsive: 2–5 columns)
- Hover overlay with Download and Remove actions
- Media type badge (movie = blue, tv = purple)
- Empty state with link to Browse
- Loading skeleton while fetching

### Activity Logs

**Tracked actions:** login, login_failed, logout, register, torrent_add, torrent_delete, user_update, user_delete, brute_force_config_update, brute_force_unblock_ip, discord_mentions_update, disk_config_update

**Features:**
- Paginated table with time, user, action, details, IP, user agent
- Filter by action type and user
- IP resolution from: CF-Connecting-IP, X-Forwarded-For, X-Real-IP
- Auto-cleanup: logs older than 90 days deleted on startup
- Click-to-copy: click details, IP, or user agent columns to copy full value to clipboard (toast: "Skopiowano"/"Copied")

### System Dashboard (`/admin/settings`)

**Refactored into independent sub-components** (each fetches its own data):

| Component | File | Purpose |
|-----------|------|---------|
| `SettingsSystemStatus` | `components/settings/SystemStatus.vue` | Service health checks |
| `SettingsDiscordWebhook` | `components/settings/DiscordWebhook.vue` | Discord locale + mentions toggle |
| `SettingsDiskStatus` | `components/settings/DiskStatus.vue` | Disk check toggle + min GB + progress bars |
| `SettingsLiveLogs` | `components/settings/LiveLogs.vue` | SSE log viewer |

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

**Disk status (`SettingsDiskStatus`):** Shows all configured disks with progress bars, free/used/total space, OK/Low/Unavailable badges. Toggle to enable/disable disk space check. Input to set minimum required free space in GB. Toast on save.

**Discord webhook (`SettingsDiscordWebhook`):** Select Discord embed language (pl/en). Toggle user mentions on/off. Toast on save.

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
- Uses `setLocale()` from `useI18n()` for locale switching (not `locale.value =`)
- Google Translate prevention: `<meta name="google" content="notranslate">`, `translate="no"` on `<html>`, `notranslate` class on `<body>`
- TMDB logo title treatments: `getLogosForItems()` fetches `/movie/{id}/images` and `/tv/{id}/images` with `include_image_language={lang},null`, picks best logo per locale (ISO 639-1 codes: `en`, `pl`), cached in Redis (24h TTL)
- Trending content now passes `language` param to TMDB API (titles are locale-aware, not always English)
- Wishlist translations: `wishlist.*` namespace with title, buttons, empty state, toast messages

### Technical Features

**Pino logger:**
- `server/utils/logger.ts` - pino + pino-pretty (dev: colorized, prod: JSON)
- `createLogger(module)` returns a wrapper that logs to pino (stdout/Docker/Dozzle) AND to a ring buffer (500 lines) for SSE live streaming
- Modules: Download, Add, FlareSolverr, Discord, TorrentSync, DB
- All server files use structured logger (no `console.log`)

**Background torrent sync:**
- Nitro plugin `server/plugins/torrent-sync.ts` runs every 10s (configurable via `NUXT_TORRENT_SYNC_INTERVAL_MS`)
- Extracted sync logic into `server/utils/torrent-sync.ts`
- Polls qBittorrent for active download progress
- Detects completion via 4 signals: `completion_on > 0`, `downloaded >= size`, `progressPct >= 99.9`, state in completedStates
- When torrent not found: `downloadedBytes >= sizeBytes` → completed, else → failed
- Triggers Discord webhook on completion
- Triggers Jellyfin library scan after prep delay

**Redis caching (optional):**
- TMDB search: 24h TTL
- TMDB details: 7d TTL
- TMDB logos: 24h TTL per logo (with `__none__` sentinel for null logos)
- Prowlarr results: 30min TTL (empty results not cached)
- Popular/trending: 6h TTL
- Graceful fallback if Redis unavailable

**Prowlarr result deduplication:**
- Two-pass: first by `downloadUrl` (exact match), then by `title+size`
- Keeps highest seeders in each group
- Runs before caching

**Prowlarr search improvements:**
- Parallel IMDB + text search for private trackers (both run simultaneously, results merged)
- Polish season/episode detection: `sezon \d+`, `Odc.`, `Odcinek`, `Episode`, `Ep.`
- Fallback queries for private trackers (multiple query variations)
- Empty results not cached (prevents stale empty cache)
- Season-specific cache keys (prevents collision)
- Season packs scored through `rankTorrents()` (not manually mapped)

**Torrent file validation (Polish trackers):**
- Binary validation: torrent files start with `0x64` (d = bencode dictionary)
- HTML starts with `0x3c` (<)
- Response read as `arrayBuffer()` not `text()`
- HTML detection: content-type + body check (not just first byte)

**ESLint strict TypeScript:**
- `projectService: true`
- `@typescript-eslint/no-explicit-any`
- `no-unsafe-*` rules
- `no-floating-promises`
- `strict-boolean-expressions`
- Server files: `'no-console': 'off'`
- App files: `'no-console': 'warn'`

**Path aliases:**
| Alias | Resolves to |
|-------|-------------|
| `#server` | `./server/` |
| `#db` | `./server/database/` |
| `#utils` | `./server/utils/` |

### PWA (Progressive Web App)

**Configuration:**
- `@vite-pwa/nuxt` module with `autoUpdate` register type
- Web manifest with StreamHub branding (amber theme, dark background)
- Display: `standalone` (full-screen app experience)
- Start URL: `/dashboard`

**Icons:**
| File | Size | Purpose |
|------|------|---------|
| `pwa-64x64.png` | 64×64 | Small icon |
| `pwa-192x192.png` | 192×192 | Standard icon |
| `pwa-512x512.png` | 512×512 | Large icon |
| `maskable-icon-512x512.png` | 512×512 | Android adaptive icon |
| `apple-touch-icon-180x180.png` | 180×180 | iOS home screen icon |

**Service worker:**
- Workbox-based with `generateSW` strategy
- Navig fallback to `/dashboard`
- Caches: JS, CSS, HTML, ICO, PNG, SVG, WOFF2
- Periodic sync for updates: every 3600s (1 hour)

**Features:**
- Auto-update: new service worker activates automatically
- Offline support: cached static assets available offline
- Install prompt: intercepted via `$pwa.install()` for custom install UI
- `NuxtPwaAssets` component handles manifest link, theme-color meta, and icon links

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
| Password hashing | [bcrypt](https://github.com/kelektiv/node.bcrypt.js) v6.0.0 |
| Movie data | [TMDB API](https://www.themoviedb.org/documentation/api) v3 |
| Torrent search | [Prowlarr](https://prowlarr.com/) (Newznab-compatible) |
| Torrent client | [qBittorrent](https://www.qbittorrent.org/) via [qui](https://github.com/autobrr/qui) proxy |
| Cloudflare bypass | [got-scraping](https://github.com/sindresorhus/got-scraping) v4.2.1 (Chrome TLS impersonation) |
| Notifications | [discord.js](https://discord.js.org/) REST v2.6.1 + Builders v1.14.1 |
| Logging | [pino](https://getpino.io/) v10.3.1 + pino-pretty v13.1.3 |
| PWA | [@vite-pwa/nuxt](https://github.com/vite-pwa/nuxt) v1.1.1 (Workbox) |
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
NUXT_TRACKER_ENCRYPTION_KEY=replace_me_with_64_hex_chars
```

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
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
| `NUXT_TRACKER_ENCRYPTION_KEY` | AES-256-GCM key for tracker passwords (64 hex chars) |

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

## Components

| Component | Description |
|-----------|-------------|
| `MediaCard.vue` | TMDB media card with 3D tilt effect, used in browse carousels |
| `MediaCarousel.vue` | Reusable carousel with title, scroll arrows (hover-reveal), skeleton loading, `MediaCarouselItem` type (includes `logoUrl`) |
| `ConfirmDialog.vue` | Confirmation dialog with `close: [value: boolean]` emit for Nuxt UI overlay system |
| `settings/SystemStatus.vue` | Service health check cards (independent data fetching) |
| `settings/DiscordWebhook.vue` | Discord locale + mentions toggle (independent data fetching) |
| `settings/DiskStatus.vue` | Disk check toggle, min GB input, progress bars (independent data fetching) |
| `settings/LiveLogs.vue` | SSE live log viewer with pause/clear/download (independent data fetching) |

## Pages

| Route | File | Description |
|-------|------|-------------|
| `/` | `index.vue` | Redirects to `/dashboard` or `/login` |
| `/login` | `login.vue` | Login page |
| `/dashboard` | `dashboard/index.vue` | Dashboard with stats, active downloads, hero banner, carousels |
| `/dashboard/submit` | `dashboard/submit.vue` | Torrent submission (magnet/URL/file) |
| `/dashboard/downloads` | `dashboard/downloads.vue` | User's paginated download list |
| `/dashboard/wishlist` | `dashboard/wishlist.vue` | User's saved titles for later download |
| `/browse` | `browse/index.vue` | Search + carousels (Trending, Popular, Top Rated) |
| `/browse/movie/:id` | `browse/movie/[id].vue` | Movie detail with Prowlarr torrents |
| `/browse/tv/:id` | `browse/tv/[id].vue` | TV show detail with season selector |
| `/admin/users` | `admin/users.vue` | User management |
| `/admin/trackers` | `admin/trackers.vue` | Custom tracker management |
| `/admin/requests` | `admin/requests.vue` | Media request management |
| `/admin/settings` | `admin/settings.vue` | System status, disk status, live logs |
| `/admin/logs` | `admin/logs.vue` | Activity logs with click-to-copy |
| `/admin/brute-force` | `admin/brute-force.vue` | Brute force protection (blocked IPs, config) |

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
| `discord_id` | text | - | Discord user ID for mentions in webhook notifications |

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
| `poster_url` | text | - | TMDB poster URL (w185) |
| `is_private` | integer (bool) | `false` | From private tracker |

### `customTrackers`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | text (PK) | - | UUID |
| `indexer_name` | text (unique) | - | Tracker name (e.g. "Devil-Torrents") |
| `tracker_type` | text | `counting` | `guid` (cookie/login scraping) or `counting` (no auth) |
| `cookie` | text | `''` | Session cookie (for Cookie method) |
| `login_url` | text | - | Login page URL (for Login method) |
| `login_username` | text | - | Login username (for Login method) |
| `login_password` | text | - | AES-256-GCM encrypted password (for Login method) |
| `enabled` | integer (bool) | `true` | Whether tracker is active |
| `created_at` | text | - | ISO timestamp |

### `loginAttempts`
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | text (PK) | - | UUID |
| `ip` | text | - | Client IP address |
| `username` | text | - | Attempted username |
| `success` | integer (bool) | `false` | Whether login succeeded |
| `user_agent` | text | - | Client user agent |
| `created_at` | text | - | ISO timestamp |

Indexes: `(ip, created_at)`, `(username, created_at)`, `(created_at)`

### `settings`
| Column | Type | Description |
|--------|------|-------------|
| `key` | text (PK) | Setting name |
| `value` | text | Setting value |

Known keys: `discord_locale` (pl/en), `discord_mentions_enabled` (true/false), `disk_check_enabled` (true/false), `disk_min_free_gb` (integer as string), `brute_force_max_attempts_per_ip`, `brute_force_ip_block_duration_minutes`, `brute_force_window_minutes`

### `activityLogs`
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
| `user_note` | text | Optional message from user to admin |
| `admin_note` | text | Admin response note (on accept/reject) |
| `created_at` | text | ISO timestamp |
| `updated_at` | text | Last update timestamp |

### `wishlist`
| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | UUID |
| `user_id` | text (FK) | Owner |
| `media_type` | text | `movie` or `tv` |
| `media_id` | integer | TMDB media ID |
| `media_title` | text | Title |
| `media_poster` | text | TMDB poster URL |
| `created_at` | text | ISO timestamp |

Unique index: `(user_id, media_type, media_id)` — prevents duplicate wishlists per user.

## API Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | No | Login with username/password (records login attempts for brute force) |
| POST | `/api/auth/logout` | Yes | Clear session |
| POST | `/api/auth/register` | Admin | Create new user |
| GET | `/api/auth/me` | Yes | Get current session |

### User
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/user/limits` | Yes | Get user's current usage and limits (fresh from DB) |

### Torrents
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/torrents/add` | Yes | Add torrent (magnet/file/URL). Admin gets queue priority. |
| GET | `/api/torrents/list` | Yes | List downloads with pagination (`page`, `limit` params). Admin sees all. |
| GET | `/api/torrents/:id` | Yes | Get single download |
| DELETE | `/api/torrents/:id` | Yes | Delete download |

### Browse
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/browse/search` | Yes | Search TMDB (`q`, `type`, `page`, `locale` params) |
| GET | `/api/browse/popular` | Yes | Popular movies + TV (with logo URLs) |
| GET | `/api/browse/trending` | Yes | Trending content (with logo URLs) |
| GET | `/api/browse/top-rated` | Yes | Top rated movies |
| GET | `/api/browse/movie/:id` | Yes | Movie details (`locale` param) |
| GET | `/api/browse/movie/:id/torrents` | Yes | Prowlarr search for movie (with `isPrivate`, `percentage`) |
| GET | `/api/browse/tv/:id` | Yes | TV show details (`locale` param) |
| GET | `/api/browse/tv/:id/torrents` | Yes | Prowlarr search for TV (with `isPrivate`, `percentage`) |
| GET | `/api/browse/tv/:id/season/:season` | Yes | Season episodes + torrents (with `isPrivate`, `percentage`) |
| POST | `/api/browse/download` | Yes | Download from browse (11-step pipeline) |

### Requests
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/requests/post` | Yes | Submit media request (with optional user note) |
| GET | `/api/requests/mine` | Yes | Check if user requested a title |
| GET | `/api/requests/my` | Yes | Get user's own requests with status |
| GET | `/api/requests/list` | Admin | List all requests (paginated, filterable) |
| PATCH | `/api/requests/:id` | Admin | Accept/reject request (with optional admin note) |

### Wishlist
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/wishlist` | Yes | Add title to wishlist |
| DELETE | `/api/wishlist` | Yes | Remove from wishlist (by id or mediaType+mediaId) |
| GET | `/api/wishlist` | Yes | List user's wishlist items |
| GET | `/api/wishlist/check` | Yes | Check if title is wishlisted (`mediaType`, `mediaId` params) |

### Debug
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/debug/prowlarr` | Admin | Raw Prowlarr search diagnostics |

### Admin - General
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/system-status` | Admin | Service health checks |
| GET | `/api/admin/disk-status` | Admin | Disk space status (reads from DB) |
| PUT | `/api/admin/disk-status` | Admin | Update disk check settings (`checkEnabled`, `minFreeSpaceGb`) |
| GET | `/api/admin/settings` | Admin | App settings |
| GET | `/api/admin/discord-locale` | Admin | Get Discord locale |
| PUT | `/api/admin/discord-locale` | Admin | Set Discord locale |
| GET | `/api/admin/discord-mentions` | Admin | Get Discord mentions enabled status |
| PUT | `/api/admin/discord-mentions` | Admin | Toggle Discord mentions enabled/disabled |

### Admin - Users
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/users` | Admin | List all users |
| POST | `/api/admin/users` | Admin | Create user |
| PUT | `/api/admin/users/:id` | Admin | Update user |
| DELETE | `/api/admin/users/:id` | Admin | Delete user |

### Admin - Trackers
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/trackers` | Admin | List all custom trackers |
| POST | `/api/admin/trackers` | Admin | Create tracker (cookie or login method) |
| PUT | `/api/admin/trackers/:id` | Admin | Update tracker |
| DELETE | `/api/admin/trackers/:id` | Admin | Delete tracker |
| POST | `/api/admin/trackers/[id]/test-login` | Admin | Test tracker login credentials |

### Admin - Brute Force
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/brute-force/config` | Admin | Get brute force config |
| PUT | `/api/admin/brute-force/config` | Admin | Update brute force config |
| GET | `/api/admin/brute-force/blocked-ips` | Admin | List blocked IPs |
| DELETE | `/api/admin/brute-force/blocked-ips` | Admin | Unblock an IP |
| GET | `/api/admin/brute-force/stats` | Admin | Brute force statistics |

### Admin - Logs
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/logs` | Admin | Paginated activity logs (filter by action, userId) |
| GET | `/api/admin/logs-stream` | Admin | Live logs SSE stream (ring buffer, 500 lines) |

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

## License

[AGPL-3.0](LICENSE) - Copyright (C) 2025 Nort
