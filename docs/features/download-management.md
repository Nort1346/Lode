# Download Management

## Overview

The download management system tracks torrent progress from qBittorrent, provides real-time status updates, and manages the download lifecycle.

## Pages

### Dashboard (`/dashboard`)
- Summary cards with active downloads, completed today, total storage
- Recent downloads with progress bars
- Quick access to download details

### Downloads (`/dashboard/downloads`)
- Full download list with filtering and sorting
- Quality badges (dead/poor/slow/ok)
- Progress bars with ETA and speed
- Delete/pause/resume controls

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

Torrent health is determined by seed count and download speed:

| Badge | Condition | Color |
|-------|-----------|-------|
| `dead` | No seeds | Red |
| `poor` | < 5 seeds | Orange |
| `slow` | 5-20 seeds | Yellow |
| `ok` | > 20 seeds or active download | Green |

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

```ts
const qualityConfig = {
  dead: { border: 'border-red-500/50', badge: 'bg-red-500/20 text-red-400' },
  poor: { border: 'border-orange-500/50', badge: 'bg-orange-500/20 text-orange-400' },
  slow: { border: 'border-yellow-500/50', badge: 'bg-yellow-500/20 text-yellow-400' },
  ok:   { border: 'border-green-500/50', badge: 'bg-green-500/20 text-green-400' }
}
```

## Formatting Utilities

| Function | Example | Description |
|----------|---------|-------------|
| `formatEta(3661)` | `1h 1m` | Human-readable ETA |
| `formatSpeed(1048576)` | `1.0 MB/s` | Human-readable speed |
| `formatSize(1073741824)` | `1.00 GB` | Human-readable size |
| `formatDate('2025-01-15')` | `15.01.2025` | Localized date |
