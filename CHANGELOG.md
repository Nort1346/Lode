# Changelog

All notable changes to Lode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.1] - 2026-09-12

Rebrand from StreamHub to Lode, a rework of the auto-setup scripts into a component-based installer, and a batch of download-pipeline fixes.

### Added

- Jellyfin health check - authenticated endpoint with a two-state (connected/error) result, surfaced in Admin > Settings with a status banner
- Paused torrent state detected in sync, refresh, and dedupe; paused torrents shown on the dashboard with a purple badge
- Download cards now show the torrent name as a subtitle with the request date and time
- Dashboard stat cards are clickable (scroll to active downloads or jump to the downloads page)
- Browse carousels (spotlight and trending) respect the movie/TV type filter
- Skeleton loading UI replaces spinners across the admin panel (sessions, logs, requests, users, trackers) and browse search
- PWA icons and app assets regenerated with the new Lode branding
- Hero section custom override props (`customTitle`, `customDescription`, `customLogoUrl`, `customBackgroundUrl`, `tmdbId`) for per-instance hero content
- Setup scripts (bash + PowerShell): API keys and secrets can now be entered by copying the value to your clipboard and pressing Enter - read via `Get-Clipboard` (Windows), `pbpaste` (macOS), `wl-paste` (Wayland), or `xclip`/`xsel` (X11); typing `m` at the prompt falls back to manual paste, and systems without a clipboard tool go straight to the manual prompt
- Setup scripts (bash + PowerShell): the Discord webhook step is now opt-in - an explicit y/N gate decides whether to walk through the webhook setup
- Expanded unit-test coverage for Prowlarr, TMDB, FlareSolverr, and Jellyfin sync, plus browse routes and the Jellyfin health check
- Custom slim scrollbar (8px) with light and dark theming across all scrollable areas
- SeasonPack card titles marquee-scroll when truncated instead of being clamped to a single line

### Changed

- **Rebrand: StreamHub is now Lode** - app name, repository (`Nort1346/StreamHub` → `Nort1346/Lode`), all i18n strings, PWA manifest, brand color (`#f7aa14`), wordmark, and social/OG preview assets
- **Breaking - Docker image renamed**: `ghcr.io/nort1346/streamhub` → `ghcr.io/nort1346/lode`; old `streamhub` tags are frozen and no longer updated
- **Breaking - compose project and container names**: `streamhub` / `streamhub-*` → `lode` / `lode-*`; existing installs must stop and remove the old containers before starting the new stack
- **Breaking - PostgreSQL**: database and user renamed `streamhub` → `lode`; update `DATABASE_URL` / `POSTGRES_DB` (or create the `lode` database)
- **Breaking - avatars volume renamed**: `streamhub-avatars` → `lode-avatars`; uploaded avatars do not carry over unless the volume is manually copied to the new name
- Environment variable names are unchanged - the `NUXT_*` prefix and all existing keys work as before
- Split the Docker stack into a base `docker-compose.yml` (Lode + Redis) plus per-service overlays (`postgres`, `qbittorrent`, `prowlarr`, `jellyfin`, `flaresolverr`, `dozzle`) so you deploy only the services you need
- Rewrote the auto-setup scripts (bash + PowerShell) as a guided 15-step, component-based installer: you pick the database, image tag, torrent client, indexer, media server, and optional add-ons, and the script downloads and starts only the matching compose files
- Setup selections persist to `.lode-setup`, so re-running the script prefills previous choices and migrates legacy single-file compose installs
- Secrets are now generated idempotently - re-running the installer no longer invalidates existing sessions or encrypted data
- Bumped `@nuxt/ui` to 4.11.0, pinned `@tiptap` to 3.31.3, and overrode `fast-uri`, `nanoid`, and `esbuild` to patched versions
- Upgraded packages and removed workspace dependency overrides; lockfile regenerated
- Bolder font weight on action button labels (hero CTA, torrent and SeasonPack download, and Browse buttons)
- Bumped `@vite-pwa/assets-generator` to 2.0.0 - dedupes sharp to 0.35.4 (fixes the Windows native-module load error during `pnpm dev`) and adds an `apple-touch-icon-180x180` for newer iPhones

### Removed

- `docker-compose.sqlite.yml` (replaced by the base `docker-compose.yml` + overlays)
- The "No qBittorrent" option in the setup wizard - qBittorrent is required for downloads ("No media server" is still available)

### Fixed

- Torrent dedupe now matches pending, downloading, and completed rows; returns 409 when qBittorrent already has the torrent; delete requests wait for qBittorrent removal before responding
- qBittorrent v5 `stoppedDL`/`stoppedUP` states handled as paused/completed
- No-seeder alerts restored by tracking unknown seeder counts
- Quality badge gated on downloading; pause transitions logged
- Private tracker users no longer logged out on tracker cookie check failures
- Carousels: percentage-based card sizing with snap points and hover-safe padding; swipe arrows aligned to poster center
- Hero section locale switching fixed
- Buttons and menu items get a global pointer cursor; invalid `dark:text-zinc-white` class on the dashboard ETA label removed
- Setup scripts: real port-in-use check, console window stays open on exit, graceful failed-start handling, PATH refreshed after gum install so first runs use the gum UI
- Setup scripts: secret prompts no longer leak into the saved value - `setup.ps1` (with gum) captured the colored prompt line into the key, and `setup.sh` (without gum) captured a stray newline after masked input
- Setup script (PowerShell): running the installer via `irm ... | iex` no longer closes your terminal window - `iex` runs the script inside your own session where `exit` would kill it, so the script now re-launches itself as a standalone child process (reusing the copy the self-update check already downloaded) and the original session is left untouched
- Setup scripts: generated `.env` and compose files are written atomically via a temp file, so an interrupted write no longer leaves a partial or corrupt file
- Setup scripts: corrected the multi-file compose flags and the fresh-run update prompt
- Dependency: transitive `esbuild` pinned to `>=0.28.0` to fix CVE-2025-68121

## [1.0.0] - 2026-08-30

Initial public release.

### Added

- Browse & Search with TMDB carousels (Popular, Trending, Top Rated), spotlights, genre discovery, and debounced full-text search
- TMDB localization - browse results and metadata follow the selected UI locale
- In-library detection - browse items flagged when already present in Jellyfin libraries
- One-click torrent download via magnet link, torrent URL, or uploaded .torrent file
- Torrent Ranking System with configurable weighted scoring engine (max 205 base points - resolution, language, seeders, size, source, group), title relevance, and season-pack detection
- Private Tracker Support with cookie and login auth (GUID and counting trackers), server-side credential encryption, test-login endpoint, auto-retry on session expiry, and FlareSolverr CAPTCHA bypass
- Download safety - dangerous file rejection, per-user cooldown rate limiting, per-user max torrent size, and pre-download disk space check with multi-disk support and editable thresholds
- Torrent sync plugin with configurable background interval (10s default) keeping progress, speeds, and seeder counts fresh
- Quality badges (dead/poor/slow/ok) derived from download speed and ETA
- Active downloads pinned to the top of the downloads list
- Admin downloads bypass per-user limits and are moved to the top of the qBittorrent queue
- User Management with per-user daily/active download limits, max torrent size, private tracker limits, canSubmit flag, and password generation
- Brute-force login protection, auto-expiring accounts, and server-side session validation with per-user session limits
- Admin session management panel with server-side validation
- Jellyfin Integration with library detection, user CRUD sync with per-provider sync status, avatar upload, Jellyfin presets, Live TV config, and realtime library monitoring for auto-created libraries
- DiceBear avatar system with 12 styles, upload, and Jellyfin sync
- Request & Wishlist system with admin approve/reject review, dashboard request carousel, and Discord notification on new requests
- Notifications with SSE real-time in-app (notification sound, iOS Safari support), Discord webhooks (locale-aware, configurable user mentions, Components v2 embeds), and browser push (VAPID)
- Admin Panel with activity and live log streams, system status, disk monitoring with low-disk blocking, ranking config, Jellyfin presets, Discord settings, and click-to-copy
- Configurable prep countdown for file transfer estimation
- PWA support with install prompt, auto-update, offline support, and push notifications
- i18n with 6 languages (EN, PL, DE, FR, ES, PT-BR), including TMDB and Discord locale support
- PostgreSQL support alongside default SQLite (dual driver via DB_DRIVER)
- Health check endpoint with database connectivity status
- Optional Redis caching for TMDB and Prowlarr results
- Docker deployment with multi-stage build and docker-compose for both SQLite and PostgreSQL
- Auto-setup scripts for Linux/macOS (bash) and Windows (PowerShell) with guided 14-step wizard
- Zod config validation at startup
- Scroll reveal animations throughout the UI
- Responsive pagination with useBreakpoints composable
- 859 unit tests across 120 test files
