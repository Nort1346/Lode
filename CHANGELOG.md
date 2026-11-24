# Changelog

All notable changes to Lode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.7] - 2026-11-24

Media organization with download staging, live import progress and a ready notification that waits for the import; server-side torrent fetching and shared download ETAs; a new session secret with a compatibility fallback; Playwright E2E and SQLite/PostgreSQL parity suites; a reworked release matcher with episode and multi-season packs; plus UI polish, admin media config, and a broad dependency refresh.

### Added

- Library: automatic media organization of finished downloads into library folders, using \*arr-style staging import. Configure staging dirs with `NUXT_DOWNLOAD_PATH_MOVIES` / `NUXT_DOWNLOAD_PATH_SERIES`, choose `hardlink`, `copy` or `move` import mode, import every video of a season pack including multi-episode ranges, opt into extra files (subtitles, NFO) with a configurable extension allow-list, and clean up staging leftovers in `move` mode. Existing rows are backfilled to `skipped` so upgrading never re-imports old downloads (ad3d9661, c237975b, d610dcd0, f6d509fb, eaad8f1c, b8af9783, b7798acd, 1cc6b8d3)
- Library: live import progress sampled from `.partial` files, merged into `/api/torrents/list` and rendered as a preparation bar; Jellyfin, Discord and push are now dispatched together by a single-flight ready pass only after the prep countdown and the library import have settled (b7798acd, 653bfca3)
- Setup: download-staging step in the 17-step installer - accepting it pre-creates `media/downloads/movies` and `media/downloads/series` and writes the staging env vars; skipping it removes them (9cd9d5da)
- Downloads: torrents are fetched server-side from Prowlarr, so qBittorrent never needs the indexer URL; usable magnets are preferred, the torrent payload type moved to shared types, and the indexer URL is fetched when Prowlarr puts it in `magnetUrl` (212ca69e, 3c319118, 3ea506b0, 7a75653f)
- Browse: indexer filter on movie and TV pages; release matching against up to 8 TMDB title candidates with whole-token matching, a parallel IMDb search and a 50 s query-ladder budget; loose matches stay in separate "Other results" / "Other releases" sections and are never recommended (0b3e0b18, e352aded)
- TV: multi-season packs in season browsing, shown on every covered season with a season-range label, plus episode range packs (`S1-8E1-96`, `S01-S03.E01-E12`) in a separate "Episode Packs" group with absolute ranges split using TMDB episode counts (17ce115a, 4d1cfc49)
- Dashboard: download ETA warm-up with a 20 s window, a 5-sample median speed and asymmetric hysteresis; the ETA is calculated once on the server and shared across all users, and short ETAs keep ticking down instead of freezing (e86024f1, 45773242, 46f51110)
- Testing: Playwright E2E suite with a mock TMDB server, an isolated SQLite database and seeded users (`pnpm test:e2e`, `pnpm typecheck:e2e`), plus a SQLite/PostgreSQL parity PoC (`vitest.db-parity.config.ts`, `LODE_PG_TEST_URL`) and dedicated CI workflows (a6f92036, 32905f58)
- API: `GET` / `PUT /api/admin/media-config` for media organization settings; browse season and movie payloads gain `seasonPacks`, `episodePacks` and `otherTorrents`; torrent rows gain `notifiedAt`, `organizeStatus`, `organizeError`, `organizedPath` and live `organizeProgress`
- Auth: deprecated `NUXT_SESSION_PASSWORD` is accepted as a fallback for `NUXT_APP_SECRET` via `scripts/start.mjs`, which logs a deprecation warning; the setup CLI migrates the old key in `.env` (ae0b1e6d)
- UI: per-page document titles via reactive `useSeoMeta`, using each page's i18n heading and the loaded item name on detail pages; `error.vue` uses the same suffix (814bdb55)

### Changed

- Auth: `NUXT_SESSION_PASSWORD` was renamed to `NUXT_APP_SECRET` because nuxt-auth-utils 0.6 seals sessions with Nuxt's `appSecret`; existing users are logged out once because the session cookie name and format changed (112fe9d0, 67853432)
- Preparation: the bar is now amber and follows the slower of the two gates (`min(countdown %, import %)`), so it reaches 100% exactly when the ready event fires; the dashboard keeps preparing rows (`completed` with `notifiedAt: null`) visible next to active downloads and removes them on the ready SSE event. "Preparing" is a UI phase, not a new DB status (b7798acd, ebc462a2)
- Browse: the phone suggestion list is only shown while the search input is focused and the virtual keyboard is open on coarse-pointer devices; the All / Movies / TV Shows control gets a sliding type indicator (9590ce35)
- Auth UI: the forced password change dialog asks only for the new password and its confirmation, with show/hide toggles for both fields (91df4d8d, ccc2785a)
- PWA: `@vite-pwa/nuxt` 2.x replaces the deprecated `workbox` options with an `injectManifest` custom worker, keeping precaching and auto-update intact (3b611780)
- Setup/Docker: the bootstraps try older non-prerelease releases when `latest` has no CLI binaries; pnpm is pinned to 12.4.1 in the Docker `base` stage; bare install stages skip `nuxt prepare` when `nuxt.config.ts` is absent; the production server starts through `scripts/start.mjs` (a22ae14f, ba44c521, 25a430e8, ae0b1e6d)
- Types: duplicate auto-imported type names removed (`SyncProviderRecord`, `SyncUserSettingsRecord`, `ServiceRuntimeStatus`); `ParsedTitle` and `RankedTorrent` moved to `server/types/torrent.ts` (6bab50c6)
- i18n: dropped the Radarr reference from the extra-files hint (3d262170)
- Docs: `AGENTS.md` and everything under `docs/` refreshed to match the code, including a new rule against unnecessary code comments
- Dependencies: `@node-rs/bcrypt` 1.10.9 to 2.0.0, `nuxt` 4.5.2 to 4.6.3, `nuxt-auth-utils` 0.5.30 to 0.6.2, `@nuxt/ui` 4.11.3 to 4.12.0, `@nuxt/image` 2.1.0 to 2.2.0, `@vite-pwa/nuxt` 1.1.1 to 2.0.2, `web-push` 3.6.7 to 4.0.0, `drizzle-orm` 0.45.3 to 0.45.4, `zod` 4.6.5 to 4.6.7, `got-scraping` 4.2.1 to 4.2.2, `eslint` 10.12.0 to 10.15.0, `prettier` 3.9.9 to 3.10.0, `vue-tsc` 3.3.12 to 3.3.14, `typescript-eslint` 8.71.0 to 8.73.0, `@nuxt/test-utils` 4.3.3 to 4.4.0, `@types/node` 26.6.4 to 26.6.6, `happy-dom` 20.14.5 to 21.0.4, `pino-pretty` 13.1.3 to 13.2.0, `@iconify-json/lucide` 1.2.139 to 1.2.156, `@iconify-json/simple-icons` 1.2.98 to 1.2.101, plus a `simple-git` 4.0.2 override

### Fixed

- qBittorrent: send `shareLimitsMode` when disabling seeding, clean up `missingFiles` torrents while always keeping library files, harden the sweep and apply the seeding toggle retroactively (1cc6b8d3)
- Library: skip existing import targets instead of overwriting them; never delete library files in `move` mode; hardlinks now fall back to copy on every link error except `EEXIST` (SMB/NFS `EXDEV`, `EPERM`, `ENOTSUP`); import extras from every release folder, not only same-folder sidecars; delete partial files when an incomplete download is removed; prune empty staging folders; serialize pending sweeps; validate `media-config` body types; stage downloads only while organization is enabled; keep the preparation bar monotonic (c237975b, b8af9783, eaad8f1c, f6d509fb, b7798acd)
- Browse: wrong-title releases can no longer outrank the right one, low-score episode results are collapsed behind "More results", and absolute episode numbers are mapped via earlier seasons' TMDB counts (e352aded, 4d1cfc49)
- ETA: short ETAs update poll by poll instead of freezing for up to a minute; trackers reset on pause, poll gaps and byte regressions and expire after 10 minutes (45773242)
- Dashboard: preparing downloads no longer disappear when qBittorrent marks them complete (ebc462a2)
- Push: use web-push 4.x named exports for ESM (71486841)
- Dev: resolved dev-terminal warnings - E1007 (`definePageMeta` in a layout), E3003 (post-mount `useFetch`), DiceBear bundling and theme hydration, with a new `useThemeToggle()` composable (53761635)
- API: `@node-rs/bcrypt` v2 receives the cost as an options object; named `$fetch` response types avoid Nuxt 4.6 typed-route depth errors (515891c4, 06baeb8b, 5a194b4c)
- Setup: fall back to older releases when the latest binary download fails; override `simple-git` to 4.0.2 (a22ae14f, 1472eef2)
- UI: Lode wordmark SVG replaced with WebP for consistent rendering (f8725fce)
- PWA: push notifications work again under `@vite-pwa/nuxt` 2.x - the registered worker is a custom `public/sw.js` built with `injectManifest` that loads `/sw-push.js`, so push, notification click, and VAPID re-subscribe handlers are active
- Prowlarr: the TV cache key now includes the season and the title candidates, so switching season or language no longer serves results cached for another season
- Prowlarr: a 429 `Retry-After` backoff is abortable and capped to the request deadline, so a huge retry header cannot stall the query ladder
- Downloads: a magnet still fetching metadata (`size = 0`) is no longer marked completed, and the detail endpoint no longer resets `completedAt` on every read, so the prep countdown and ready notification fire correctly
- Media organization: torrents vanishing before sync, failed imports, and downloads stranded in staging no longer emit a false "ready" notification; failures are surfaced on the row, with bounded retries for transient import errors
- Media organization: failed extra-file copies now count as failures, so `move` plus staging cleanup cannot delete a subtitle or NFO that never reached the library
- Media organization: single-file season, episode, and complete-series packs are imported instead of failing organization, and unknown videos are skipped rather than failing the pack
- Library: imports reserve the target with exclusive create, so two concurrent downloads of the same release cannot overwrite each other; hardlink commits now fall back to reserve+rename on mounts that reject hardlinks (EXDEV, EIO, EPERM), so imports on SMB/NFS/FUSE storage are not left failed
- Browse: separated episode ranges (`S01.E01-E24`) parse as ranges, `Season 1-3 and 5` expands correctly, and wrong-show releases are no longer marked recommended on TV pages
- Browse: absolute episode ranges split by TMDB season counts, group prefixes such as `RARBG` no longer produce a false loose match, and the legacy TV torrents endpoint returns `otherTorrents`
- UI: mobile suggestions re-baseline on rotation, budget-skipped Prowlarr queries are visible in search progress, and episode packs use an episode-pack label instead of "Season Pack"
- Security: the Prowlarr URL trust check parses URLs instead of comparing string prefixes, closing a userinfo-based SSRF bypass in server-side torrent fetching
- Setup: the deprecated `NUXT_SESSION_PASSWORD` fallback also applies to `pnpm preview`, and stale commented secrets are removed from `.env` during migration
- Seeding: a fetched hash is stored when add-verification times out, so the retroactive seeding toggle can still apply to that torrent

### Removed

- `public/logo_full.svg`, replaced by `public/logo.webp`
- PWA `workbox` / `importScripts` options (v2 uses `generateSW`)

## [1.0.6] - 2026-10-04

Release-tag detection with badges and manual filters, duplicate-torrent protection backed by live qBittorrent lookups, a timezone step in setup, human-friendly localized API errors, and a rebalanced media-source scoring - alongside Prowlarr timeout hardening, a per-torrent seeding setting, and a docs consistency pass.

### Added

- Setup: timezone detection step - the installer detects the system timezone and asks for confirmation, with validated manual entry as fallback; re-runs keep an already-set `TZ` untouched
- Browse: release-tag badges - source, codec, HDR, and audio tags parsed from release titles are shown on torrent rows and season-pack cards
- Browse: manual release-tag filters on movie and TV pages, including a hide-capture toggle for low-quality sources
- Torrents: shared episode parser - one parser for season/episode detection serves torrent search, Discord webhooks, and push notifications
- UI: human-friendly localized API errors instead of raw status codes across admin, browse, dashboard, and settings pages
- qBittorrent: per-torrent "Seeding" admin setting, enabled by default
- TV: episodes without sources are shown dimmed instead of being hidden

### Changed

- Ranking: media-source scoring rescaled - capture sources now score negative, so a high-seeder CAM can no longer outrank a low-seeder WEB-DL
- Browse: minimalist filter popover with unified badges and animated torrent lists
- i18n: typed translation keys enforced by ESLint, so missing or renamed locale keys fail lint instead of rendering blank strings
- Dependencies: updated across UI, lint, test, and icon packages, plus a `http-cache-semantics` floor (`>=4.3.0`) fixing a transitive cache-disclosure advisory
- Docs: updated alongside the features above, plus a consistency review pass

### Fixed

- Torrents: adding an already-present torrent no longer creates a duplicate - the API checks live qBittorrent presence instead of relying on stale local state
- qBittorrent: an HTTP 200 `"Fails."` add response is treated as "torrent already exists" instead of an error
- Prowlarr: slow indexers no longer stall the whole search - timed-out queries are reported as skipped in the search progress UI
- Auth: forced password change now applies only to the first-boot seeded admin
- Seed: the temporary admin password regenerates on restart until the first login is completed
- API: ranking config reset moved to the nested `config/reset` route, fixing the 404
- i18n: restored the missing `browse.filters` label and renamed the filter object to `torrentFilters`
- Setup script: falls back to the newest release that ships CLI binaries when `latest` has none
- Setup CLI: optional add-ons can now be deselected entirely

## [1.0.5] - 2026-09-28

A patch release repairing the PostgreSQL migration chain - download label columns that were missing from PostgreSQL databases, and 32-bit byte counters that overflowed on files above 2.1 GB - plus hardened binary download in the setup script.

### Fixed

- Postgres: the migration adding the download label columns (`indexer_name`, `resolution`, `qbit_tag`) was never registered in the PostgreSQL migration journal, so those columns were missing from PostgreSQL databases and download syncing crashed with `column "indexer_name" does not exist`; a backfill migration now adds the columns to existing databases on upgrade, and fresh installs receive them in order
- Postgres: `size_bytes` and `downloaded_bytes` on the `downloads` table widened from 32-bit `integer` to `bigint` - downloads larger than ~2.1 GB no longer fail to record with a `value out of range for type integer` error
- Setup script: the downloaded binary is validated before execution - a minimum size and the ELF/Mach-O magic number are required, so a cached error page or truncated download is never run
- Setup script: bounded connect timeout, transient retries, and an abort when the transfer crawls below ~1 KB/s for a minute, so a stalled download no longer hangs setup
- Setup script: an x86_64 shell running under Rosetta on Apple Silicon now downloads the native arm64 binary instead of running the TUI through Rosetta
- Setup script: the TUI is launched through the real tty device name (e.g. `/dev/ttys001`) instead of the `/dev/tty` magic device, which does not deliver keystrokes on some systems
- Setup script: `curl | bash` runs no longer drop the downloaded binary mid-execution
- Setup script (macOS): the quarantine attribute is stripped from a cached binary so Gatekeeper does not block the launch

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
