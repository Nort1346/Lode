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
| `ok` | Seeds > 0 while downloading, or >= 20 seeds | Green |
| `slow` | 5-19 seeds idle, or downloading with 0 seeds | Yellow |
| `poor` | 1-4 seeds, not downloading | Orange |
| `dead` | No seeds, not downloading | Red |

## Prep Countdown

When a download completes, a simulated "file preparation" countdown is shown:

- **Configurable speed**: Default 15 MB/s (admin setting)
- **Visual feedback**: Progress bar with estimated time
- **Disableable**: Can be turned off in admin settings
- **Purpose**: Gives users a sense of completion even though files are already on disk

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
