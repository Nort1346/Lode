# Download Management

## Overview

The download management system tracks torrent progress from qBittorrent, provides real-time status updates, and manages the download lifecycle.

## Pages

### Dashboard (`/dashboard`)
- Summary cards with active downloads, completed today, total storage
- Recent downloads with progress bars
- Quick access to download details

### Downloads (`/dashboard/downloads`)
- Paginated download list (default 10, max 100 per page) with status filtering
- Quality badges (dead/poor/slow/ok)
- Progress bars with ETA and speed
- Delete control (removes from qBittorrent and marks the record `removed`; pause/resume is managed in qBittorrent itself)

## Download Statuses

| Status | Description |
|--------|-------------|
| `pending` | Added to qBittorrent, waiting for metadata |
| `checking` | qBittorrent is checking the torrent (metadata/seed check) |
| `downloading` | Actively downloading |
| `completed` | Download finished |
| `failed` | Download failed or was removed |
| `paused` | Paused by user |
| `removed` | Removed from qBittorrent |
| `disk_full` | Rejected due to insufficient disk space |

## Quality Badges

Torrent health is determined by seed count and download speed (`getTorrentQuality`):

| Badge | Condition | Color |
|-------|-----------|-------|
| `ok` | Seeds > 0 while downloading, >= 20 seeds, or seed count unknown (-1) | Green |
| `slow` | 5-19 seeds idle, or downloading with 0 seeds | Yellow |
| `poor` | 1-4 seeds, not downloading | Orange |
| `dead` | Confirmed 0 seeds, not downloading | Red |

qBittorrent reports the seed count as -1 (unknown) until the first announce completes.
During that window the badge stays `ok` and the ETA shows "Calculating…". A confirmed
0-seed count on a torrent that is not downloading is flagged `dead`, because the
release most likely has no active seeders.

## ETA Estimation

The ETA is calculated once on the server and shared by every user, so opening the page mid-download
(or on a second device) shows the already warmed-up value instead of restarting sample collection.

- **`shared/eta-tracker.ts`** holds the pure sampling pipeline: a 20 s start-up warm-up, 5 valid speed
  samples, 5 MB of observed progress, a 5-sample median, and hysteresis so the countdown ticks down
  smoothly instead of flickering. Hysteresis only moves the displayed ETA when the change is at least
  15% relative or 60 s absolute, and that absolute step is capped at 25% of the displayed ETA (this
  fixes short ETAs that used to freeze).
- **`server/utils/torrents/eta-tracker.ts`** keeps one in-memory registry per server process, fed by the
  background sync plus `/api/torrents/*` reads. Samples closer than 2s together are ignored so several
  users or a background tick cannot push fake zero-speed samples into the window.
- The registry lives in process memory, not in a shared store: with several replicas each process estimates
  on its own and the values can differ between instances. The shipped compose runs a single Lode container.
  Nothing is persisted, so a server restart starts collecting again.
- Keep `NUXT_TORRENT_SYNC_INTERVAL_MS` below 5 minutes (`ETA_MAX_POLL_GAP_MS`, the max poll gap); a slower
  sync re-anchors on every tick and the ETA never warms up. Idle registrations are dropped after 10 minutes.
- API responses replace the raw qBittorrent `eta_seconds` with the stabilised estimate and add `etaState`
  (`collecting`, `waiting-seeders`, `calculating`, `ready`). Only `ready` carries a number.
- The client (`useEtaTracker`) just formats `etaState` / `etaSeconds`; it no longer samples speed itself.

## Preparation Phase (sequential bars)

When a download completes, the row switches from the download bar to three separate phase bars:

- **Download**: stays at 100% once qBittorrent reports the torrent complete.
- **Import to library**: follows the real byte progress of the library import reported by the
  server. A settled `done`, a clean `skipped` (organization off or a non-media category) and a
  `failed` import count as 100%; a `pending` row without a live entry (right after a restart,
  before the retry sweep) stays at 0%.
- **Waiting**: a fixed delay (admin setting `prep_delay_seconds`, default 30 s, range 0-300 s)
  that starts when the import settles, giving Jellyfin time to detect and load the new files.
  A disabled countdown counts as 100%.

The start of the wait is stored as `prep_started_at` on the download row. With media organization
enabled it is written when the import settles (`done`/`skipped`/`failed`), so a slow copy does not
consume the wait; with organization disabled, or for games/books/music, it is written at download
completion. Rows created before this column existed fall back to `completed_at`.

The ready notification (Jellyfin, Discord and push, sent together by `notifyJellyfinIfNeeded`)
fires only once both gates are open: the import has settled and the wait has elapsed. With media
organization enabled the notification is held until `organize_status` leaves `pending`, so Jellyfin
never scans a folder that is still being written.

- **Live import detail**: while an import is copying, the phase list shows
  `copied / total · speed` plus the `files done / total` counter; the downloads page polls every
  second while a byte copy is in flight and every 3 s otherwise; the dashboard now does the same and
  also shows preparing (`completed` + `notifiedAt === null`) rows alongside active downloads,
  removing them on the ready SSE event.
- **Disableable**: Can be turned off in admin settings.
- **Upgrade path**: an existing `prep_speed_mb` value is migrated to
  `clamp(round(1024 / speed), 0, 300)` seconds - the old delay for a 1 GiB file.
- There is no new DB status `preparing` - it is only a UI phase for `completed` rows whose ready
  notification has not fired yet.

## Media Organization (optional, *arr-style import)

Disabled by default. When enabled, finished downloads are imported from the
staging directory into the library folders, attached to the completion
detection in `torrent-sync` (nothing runs until a torrent actually completes).

The model follows Radarr/Sonarr: the download client owns the staging folder
and never writes into the library, so the library only ever contains organized
files and deleting a torrent never removes a library file. A torrent that was
added before staging was configured keeps its files in the library root; such a
row is marked `failed` with "download files live inside the library, not in
staging" instead of being duplicated into a second folder - re-download it with
staging configured.

| Feature | Default | What it does |
|---------|---------|--------------|
| Master switch (`media_manage_enabled`) | `false` (off) | Enables the whole import. Off = today's behaviour, files stay exactly where qBittorrent put them. Enabling requires at least one staging path (see next row) |
| Staging dirs (`NUXT_DOWNLOAD_PATH_MOVIES` / `NUXT_DOWNLOAD_PATH_SERIES`) | empty | qBittorrent landing zone; `NUXT_SAVE_PATH_*` stays the library. Files are imported from staging, the torrent stays intact there (seeding-safe). Without a staging dir for a category the download is marked `failed` with "staging dir not configured" instead of being renamed inside the library |
| Import mode (`media_import_mode`) | `hardlink` | `hardlink` keeps seeding with zero extra space but needs staging + library on one filesystem; cross-device setups (separate `/mnt` disks, SFTP mounts) answer `EXDEV` and auto-fall back to `copy`. `copy` duplicates bytes, `move` relocates and breaks seeding (only with seeding disabled). After a fully successful `move` import the torrent is removed from qBittorrent **without its files**, so it does not linger in "Missing Files"; the library copy is untouched |
| Extra files (`media_import_extra_files`) | `false` (off) | Imports every file with an allowed extension (list in `media_extra_file_extensions`, default `.srt`, `.sub`, `.ass`, `.ssa`, `.vtt`, `.nfo`) from anywhere in the release - root and subfolders like `subs/` - next to the video, using the import mode. Sidecars named after the video follow that video (language/forced suffixes kept, `.en.srt`); the rest (e.g. `ang.srt`) lands once next to the main file, keeping its own stem (`.ang.srt`) |
| Staging cleanup (`media_cleanup_staging`) | `false` (off) | Only with `move`: after a fully successful import, removes everything the torrent left behind in staging (covers, `.screens`, `.url`, `.txt`, `.nfo`, `.sfv`, plus any video or subtitle the importer did not take) and prunes every folder the release left empty - the release tree, its subfolders, and the category dir when it becomes empty. Move mode leaves nothing to seed, so the whole leftover set is garbage. Only empty dirs are removed (`rmdir`), so a file the torrent did not list keeps its folder alive; the staging root and the library are never touched; a partial import (`failed`/`skipped`) keeps everything so the admin can inspect it |
| Movie naming | on when enabled | `Title (Year)/Title (Year) Resolution Source.ext`, title/year from TMDB when `tmdbId` is known, otherwise the request label |
| Series naming | on when enabled | `Series/Season 02/Series - S02E02 Resolution Source.ext`; multi-episode files keep the range (`S02E02-E03`); daily releases use the air year (`Season 2026` + air date) |
| Main-file pick | always | Movies import the largest non-sample video, `sample` files are skipped. Series import **every** video file, so season packs are fully imported instead of only the biggest episode; videos inside bonus-material folders (`Extras/`, `Featurettes/`, `Trailers/`, `Bonus Features/`, ...) are ignored so they cannot fail the pack. Games/books/music are left untouched (`skipped`) |
| Status tracking | always | Each download row carries `organized_path`, `organize_status` (`pending`/`done`/`failed`/`skipped`) and `organize_error`; failures never break the sync loop; a second download of the same release is `skipped` with "target already exists"; a partially imported pack is `failed` with the first error so it shows up for the admin. A completed row left `pending` by an interrupted run is retried on the next sync (in-flight guard, idempotent import); rows without a torrent hash are marked `skipped` with the reason. A pending-import sweep runs at most once at a time, and a row already settled by the completion path is never re-imported; `PUT /api/admin/media-config` validates body types and refuses to enable organization without staging |
| Missing-files cleanup | always | Every sync checks completed rows whose import is `done` (any import mode) and drops the torrent from qBittorrent when its state is `missingFiles`. **Only the torrent is removed - its files are always kept.** This cleans up torrents left behind by older `move` imports; a torrent re-added after the row completed is skipped. Rows without a confirmed library import are never touched |
| Safe delete | always | Deleting a download never touches the library: in `hardlink`/`copy` modes (an unknown mode normalizes to `hardlink`) the staging copy goes with the torrent. In `move` mode the staging files are removed while the download is still incomplete (partial garbage) and after the import moved the files out (only release leftovers remain), but a completed download whose import has not settled yet keeps its files - in move mode they are the only complete copy. An unreadable import-mode setting keeps the files too. When the delete removes the files, the now-empty release folders are pruned as well (qBittorrent deletes the files, not the folders) |
| Jellyfin targeting | always | Each successful import notifies Jellyfin about the exact folder it wrote to, so the scan starts right away; the countdown notification targets the organized folder when known, otherwise the library root |
| Quality choice | manual | The release is always picked by the user - there is no automatic quality selection or upgrading |
| Admin API | - | `GET/PUT /api/admin/media-config` (`enabled`, `importMode`, `importExtraFiles`, `extraFileExtensions`, `cleanupStaging`; `GET` also reports which staging dirs are configured) |

## Real-Time Updates

### Torrent Sync Plugin
Background plugin polls qBittorrent every N seconds (default: 10s):

1. Fetches all tracked torrents from qBittorrent
2. Updates progress, speed, ETA, seeds in DB
3. Detects completion → triggers notifications
4. Handles disk full detection

### SSE Push
Status changes are pushed to connected clients via Server-Sent Events:
- Progress updates
- Status changes
- Completion notifications

## Quality Config

Each entry has `border`, `badge`, `badgeText` (i18n label), and `bar` (progress bar color):

```ts
const qualityConfig = {
  dead: { border: 'border-red-500/50', badge: 'bg-red-500/20 text-red-400', badgeText: t('dashboard.dead'), bar: 'bg-red-500' },
  poor: { border: 'border-orange-500/50', badge: 'bg-orange-500/20 text-orange-400', badgeText: t('dashboard.poor'), bar: 'bg-orange-500' },
  slow: { border: 'border-yellow-500/50', badge: 'bg-yellow-500/20 text-yellow-400', badgeText: t('dashboard.slow'), bar: 'bg-yellow-500' },
  ok:   { border: 'border-green-500/50', badge: 'bg-green-500/20 text-green-400', badgeText: t('dashboard.good'), bar: 'bg-green-500' }
}
```

## Formatting Utilities

| Function | Example | Description |
|----------|---------|-------------|
| `formatEta(3661)` | `1h 1m` | Human-readable ETA |
| `formatSpeed(1048576)` | `1.0 MB/s` | Human-readable speed |
| `formatSize(1073741824)` | `1.00 GB` | Human-readable size |
| `formatDate('2025-01-15')` | locale-dependent (2-digit month/day, numeric year) | `toLocaleDateString` in the active locale; returns `-` for empty input |
