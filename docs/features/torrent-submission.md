# Torrent Submission

## Overview

Users can add torrents to qBittorrent through three input methods. The submission flow includes validation, rate limiting, size checks, and dangerous file rejection.

## Input Methods

### 1. Magnet Link
Standard `magnet:?xt=urn:btih:...` links. The most common method.

### 2. Download URL
Direct HTTP/HTTPS links to `.torrent` files. Downloaded via the qui proxy.

### 3. GUID (Private Tracker)
For private trackers that require authentication:
- Cookie-based: Uses stored session cookie
- Login-based: Auto-login with credentials, fetch torrent file
- Uses `got-scraping` with Chrome TLS impersonation
- Automatic retry on session expiry (re-login + retry once)

## Download Flow

1. **Authentication check** — Session must be valid
2. **Fresh user data** — Re-fetches user limits from DB
3. **Cooldown check** — 5-second per-user cooldown between adds
4. **Input validation** — Magnet URL prefix, save path validation
5. **Limit checks** (non-admin only):
   - Active torrent limit
   - Daily download limit
   - Private tracker daily limit
6. **Mutex lock** — Serializes torrent additions globally
7. **qBittorrent add** — Via qui proxy (magnet or torrent file)
8. **Dangerous file check** — Scans file list for executables/scripts
9. **Size check** — Compared against user's `maxTorrentSizeGb`
10. **Disk check** — Verifies sufficient free space
11. **Admin queue priority** — Admin torrents moved to top
12. **DB insert** — Records download with metadata
13. **Library sync** — Syncs with Jellyfin if configured
14. **Discord notification** — Sends webhook if configured
15. **In-app notification** — SSE push to user

## Safety Features

### Dangerous File Rejection
Blocks torrents containing:
- Executables: `.exe`, `.msi`, `.dmg`, `.app`, `.deb`, `.rpm`
- Scripts: `.bat`, `.cmd`, `.sh`, `.ps1`, `.vbs`, `.js`
- Archives with executables: `.apk`, `.jar`
- Other: `.scr`, `.com`, `.pif`

### Disk Space Check
- Post-add verification against configured disk paths
- Deletes torrent if insufficient space
- Records `disk_full` status in DB
- Configurable minimum free space threshold

### Rate Limiting
- **Per-user cooldown**: 5 seconds between additions
- **Global mutex**: Serializes all torrent additions
- **Daily limits**: Per-user configurable
- **Active limits**: Max concurrent downloading torrents

## Save Paths

Configured via environment variables:

| Category | Env Variable | Default |
|----------|-------------|---------|
| Movies | `NUXT_SAVE_PATH_MOVIES` | `/data/Movies` |
| Series | `NUXT_SAVE_PATH_SERIES` | `/data/Series` |
| Games | `NUXT_SAVE_PATH_GAMES` | (empty) |
| Books | `NUXT_SAVE_PATH_BOOKS` | (empty) |
| Music | `NUXT_SAVE_PATH_MUSIC` | (empty) |

Only categories with configured paths appear in the UI.

## Admin Privileges

- Bypass all download limits
- Torrents moved to top of qBittorrent queue
- No daily/active/size limit checks
