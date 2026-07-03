# Admin Features

## Overview

The admin panel provides comprehensive management tools for users, downloads, system health, and configuration.

## Admin Pages

| Page | Route | Description |
|------|-------|-------------|
| Requests | `/admin/requests` | Review and manage media requests |
| Users | `/admin/users` | Create, edit, delete users |
| Trackers | `/admin/trackers` | Manage private tracker configurations |
| Ranking | `/admin/ranking` | Configure torrent ranking weights |
| Brute Force | `/admin/brute-force` | View stats, manage IP blocks |
| Sessions | `/admin/sessions` | View and revoke active sessions |
| Logs | `/admin/logs` | Activity logs + live log stream |
| Settings | `/admin/settings` | System status, disk, Discord, Jellyfin |

## Live Logs

### Activity Logs (`/admin/logs`)
- Paginated audit trail
- Filterable by action type and user
- Automatic cleanup after 90 days
- Actions tracked: login, logout, register, user CRUD, settings changes

### Live Log Stream (`/admin/logs`)
- Real-time SSE stream of Pino log output
- Ring buffer stores recent logs for backfill
- Auto-reconnect on disconnect
- Click-to-copy for log lines

## Session Management

- View all active sessions across users
- See device name, IP, user agent, last active
- Revoke individual sessions
- Revoke all sessions for a user
- Max sessions enforced per user (configurable)

## Disk Status

- Real-time disk space monitoring
- Configurable paths via `NUXT_DISKS`
- Min free space threshold (default: 7GB)
- Enable/disable checks at runtime
- Warning when disk is low on space

## System Status

Health checks for all integrated services:

| Service | Check |
|---------|-------|
| qBittorrent | GET `/api/v2/app/version` via qui proxy |
| Prowlarr | GET `/api/v1/health` |
| Jellyfin | GET `/System/Info/Public` |
| Redis | PING command |
| Discord | GET webhook URL |
| FlareSolverr | GET root URL |

Each check returns: `configured`, `status` (up/down/not_configured), `latencyMs`, `details`.

## Click-to-Copy

All admin panels support click-to-copy for:
- User IDs
- Session IDs
- IP addresses
- Torrent hashes
- Magnet links
- API keys

Uses `useCopyToClipboard()` composable with toast feedback.

## Jellyfin Presets

Configure defaults for new users:
- Sync enabled/disabled
- Library access (all or specific)
- Transcoding permissions
- Live TV access/management
- Max active sessions

## Prep Countdown

Configure the simulated file preparation countdown:
- Enable/disable
- Set simulated copy speed (1-100 MB/s)

## Discord Settings

- Locale selection (Polish/English)
- User mention toggle
- Webhook URL (configured via env)
