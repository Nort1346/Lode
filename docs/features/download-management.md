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

## Prep Countdown

When a download completes, a simulated "file preparation" countdown is shown:

- **Configurable speed**: Default 15 MB/s (admin setting)
- **Visual feedback**: Progress bar with estimated time
- **Disableable**: Can be turned off in admin settings
- **Purpose**: Gives users a sense of completion even though files are already on disk

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
| Import mode (`media_import_mode`) | `hardlink` | `hardlink` keeps seeding with zero extra space but needs staging + library on one filesystem; cross-device setups (separate `/mnt` disks, SFTP mounts) answer `EXDEV` and auto-fall back to `copy`. `copy` duplicates bytes, `move` relocates and breaks seeding (only with seeding disabled) |
| Extra files (`media_import_extra_files`) | `false` (off) | Radarr's "Import Extra Files": copies subtitles and sidecars (`.srt`, `.sub`, `.ass`, `.nfo`, list in `media_extra_file_extensions`) next to the imported video, keeping language/forced suffixes (`.en.srt`) |
| Movie naming | on when enabled | `Title (Year)/Title (Year) Resolution Source.ext`, title/year from TMDB when `tmdbId` is known, otherwise the request label |
| Series naming | on when enabled | `Series/Season 02/Series - S02E02 Resolution Source.ext`; multi-episode files keep the range (`S02E02-E03`); daily releases use the air year (`Season 2026` + air date) |
| Main-file pick | always | Movies import the largest non-sample video, `sample` files are skipped. Series import **every** video file, so season packs are fully imported instead of only the biggest episode; videos inside bonus-material folders (`Extras/`, `Featurettes/`, `Trailers/`, `Bonus Features/`, ...) are ignored so they cannot fail the pack. Games/books/music are left untouched (`skipped`) |
| Status tracking | always | Each download row carries `organized_path`, `organize_status` (`pending`/`done`/`failed`/`skipped`) and `organize_error`; failures never break the sync loop; a second download of the same release is `skipped` with "target already exists"; a partially imported pack is `failed` with the first error so it shows up for the admin. A completed row left `pending` by an interrupted run is retried on the next sync (in-flight guard, idempotent import); rows without a torrent hash are marked `skipped` with the reason |
| Safe delete | always | Deleting a download keeps the library file: in `hardlink`/`copy` modes only the staging copy is removed, in `move` mode (or an unknown mode) qBittorrent is asked to remove the torrent without touching files |
| Jellyfin targeting | always | Each successful import notifies Jellyfin about the exact folder it wrote to, so the scan starts right away; the countdown notification targets the organized folder when known, otherwise the library root |
| Quality choice | manual | The release is always picked by the user - there is no automatic quality selection or upgrading |
| Admin API | - | `GET/PUT /api/admin/media-config` (`enabled`, `importMode`, `importExtraFiles`, `extraFileExtensions`; `GET` also reports which staging dirs are configured) |

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
