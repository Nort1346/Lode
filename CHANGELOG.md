# Changelog

All notable changes to Lode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.4] - 2026-09-26

Live service health monitoring with dismissible outage notices, forced password change on first login, an optional TMDB key with a built-in shared fallback, and a more reliable torrent search with live progress - alongside browse UI polish, a custom 404 page, and signed Windows setup binaries.

### Added

- Service health monitoring - live checks of TMDB, Prowlarr, and qBittorrent (online state, API key validity, latency, and for Prowlarr the count of indexers that are enabled and not disabled in the background) exposed to the UI through a new health endpoint
- Dismissible outage notices on the browse, dashboard, and submit pages when TMDB or Prowlarr is down or rejecting its API key, Prowlarr is running with no usable indexers, or the download client is down, unconfigured, or rejecting its API key; each notice offers a "Check again" action
- Downloads blocked while qBittorrent is unavailable - starting a download opens a modal with a "Check again" retry instead of failing deep inside the download request
- Forced password change on first login - users created by an admin and the seeded admin account must set their own password in a modal before they can continue
- Optional TMDB API key - Lode ships with a built-in shared TMDB key, so metadata works out of the box without a TMDB account; setup offers the built-in key or your own, and `NUXT_TMDB_API_KEY` still takes precedence
- Torrent search progress on movie and TV detail pages - the torrent list streams the real Prowlarr search as it runs (current query, queries finished, results found so far) and recovers automatically if the stream drops mid-search
- Animated searching indicator above the skeleton cards while a browse search is running
- Genre chips on media cards - hovering a browse card reveals the title's genres
- Custom 404/error page matching the app design language

### Changed

- Torrent search now runs a merged query ladder over the localized name, original name, and up to two alternative titles (English alts first when the media language is not English) instead of stopping at the first non-empty result, so releases found under an alternative or localized title are no longer hidden by a sparse first hit, and empty results are no longer cached
- Prowlarr search is capped at 4 text queries per search, limited to 3 concurrent in-flight requests, and backs off before retrying on 429 rate-limit responses
- Browse: search and filter bar stays pinned while scrolling on all breakpoints, with a compact mode on phones; the suggestion dropdown is mobile-only, and the type filter and genre chips stay visible on tablet and desktop
- Setup: Docker pull progress shows service names instead of opaque image IDs
- Setup CLI: Windows release binaries are stamped with version metadata and Authenticode-signed via SignPath, so they no longer trip heuristic antivirus detection

### Fixed

- Ranking: season-pack results are now scored as season packs by the season endpoint instead of guessing per title, and season-pack cards show their score
- Setup: release binaries report the correct version instead of the unexpanded `${GITHUB_REF_NAME}` placeholder
- Setup: the PowerShell bootstrap no longer closes your terminal on error during session runs, double-click runs pause before the window closes, piped `irm | iex` runs no longer show a redundant prompt or re-exec messages, and both scripts show download progress and respect `NO_COLOR` / `TERM=dumb`
- Discord: download-complete webhooks no longer fail when the TMDB poster is missing - the fallback poster is bundled in the Docker image, and the webhook degrades to no attachment if it cannot be read
- Browse: tightened search bar spacing and levelled row heights on the browse page
- CI: scoped the Docker release build to tag pushes so manual workflow dispatch runs no longer produce release images, and the CLI release-wait loop logs every attempt with the real error so a stuck run is diagnosable
- Private tracker: the indexer name field placeholder no longer names specific Polish indexers

## [1.0.3] - 2026-09-19

A cross-platform TypeScript setup CLI (`lode-setup`) replaces the shell installers, alongside Docker/CI workflow fixes and a browse empty-state refinement.

### Added

- Cross-platform setup CLI (`lode-setup`): a TypeScript + @clack/prompts app compiled to standalone native binaries (Windows, macOS, Linux; x64 + arm64) that replaces the `setup.sh` / `setup.ps1` shell installers. The scripts are now thin bootstraps that download the matching binary from the latest release and run it, so no shell tooling is required on the target machine
- Lode title banner (amber gradient) at the start and end of setup

### Changed

- Setup: live progress spinners for Docker pull/up, readiness waits, and admin-credential retrieval, with warning callouts for required post-install steps
- README: repositioned around the simple direct-download workflow; tagline refreshed and download controls documented
- Browse: "no results" empty state now rotates its phrasing on each search

### Fixed

- Setup: clickable-link summary boxes keep aligned borders (BEL-terminated OSC 8 hyperlinks), and the password hint shows the simpler `docker compose logs lode`
- CI: dropped invalid `imagetools rm` steps that never existed
- CI/Docker: rewrote the docker workflow to use a native arm64 runner and add timeouts

## [1.0.2] - 2026-09-14

Per-language torrent ranking profiles, a dedicated checking status for qBittorrent verification, Docker/CI hardening, setup script v1.1 with clickable installer URLs and auto-copied credentials, and disk-space enforcement that checks the target disk before and after adding torrents.

### Added

- Torrent ranking: nested per-language profiles with multiple format types (dubbing, subtitles, lektor, VOSTFR, etc.), admin UI management, normalized scores, and transparent migration from flat language configs
- Download `checking` status for qBittorrent file verification and allocating states; the dashboard shows a teal Checking badge and progress while hiding seeders, leechers, ETA, and speeds
- Setup scripts (v1.1): user-facing URLs in `setup.sh` and `setup.ps1` are now emitted as OSC 8 hyperlinks, so terminals with hyperlink support render them as clickable links
- Setup scripts: generated qBittorrent temporary passwords and Lode admin passwords are now auto-copied to the terminal clipboard via OSC 52 where supported, while still printing the value as a fallback

### Changed

- Setup scripts: bumped to v1.1
- Setup script (PowerShell): `irm ... | iex` runs no longer show a duplicate Continue prompt before re-launching as a standalone process; the main setup confirmation still runs after startup
- Checking downloads now show a teal progress bar matching the Checking badge instead of a quality-based red bar
- Active download limits and stats now count `checking` torrents alongside downloading and paused torrents
- Dedupe now treats `checking` torrents as active, preventing duplicate re-adds during verification
- Demo animation improved with fade transitions
- PWA documentation corrected to reflect actual offline support behavior
- Ranking config and admin ranking page formatting normalized with Prettier
- Browse download requests can now include an optional torrent size so the server can verify disk space before adding the torrent to qBittorrent

### Fixed

- qBittorrent torrents in `checkingDL`, `checkingUP`, `checkingResumeData`, or `allocating` states no longer report a misleading Downloading state with 0 seeders, bad ETA, or 0 speed
- Checking torrents with `completion_on`, 100% progress, or full downloaded size no longer complete prematurely during file verification
- Docker image builds now apply OS security patches at build time
- Docker images are scanned before pushing, and releases are gated on scan results
- Disk-space checks now account for the incoming torrent size, using the size from search results, the fetched `.torrent` file, or the uploaded `.torrent` file before adding to qBittorrent
- Disk-space checks now target only the configured disk matching the download save path, so a full unrelated disk no longer blocks downloads
- If a post-add disk-space check fails, the torrent is removed from qBittorrent with data, recorded as failed, and the API returns 502 if automatic removal fails

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
