# User System

## Overview

StreamHub has a role-based user system with configurable limits, session management, brute force protection, and automatic account expiration.

## Roles

| Role | Permissions |
|------|------------|
| `user` | Browse, download (within limits), submit requests, manage wishlist |
| `admin` | All user permissions + admin panel, unlimited downloads, user management |

## Authentication

### Login Flow
1. Username + password submitted
2. Checks: expired account → deactivated → password hash
3. Creates session record in DB
4. Enforces max sessions (kicks oldest if exceeded)
5. Sets cookie via `nuxt-auth-utils`
6. Logs activity + login attempt

### Password Storage
- **StreamHub**: bcrypt hash (12 rounds)
- **Jellyfin**: Plain text sent first, then bcrypt for StreamHub
- Password order is critical for sync to work

### Session Management
- Cookie-based sessions via `nuxt-auth-utils`
- Session validation middleware checks DB on every API request
- Last active timestamp updated every 60 seconds
- Max sessions configurable per user (0 = unlimited)

## User Limits

| Limit | Default | Description |
|-------|---------|-------------|
| `dailyDownloadLimit` | 5 | Max downloads per day |
| `activeTorrentLimit` | 3 | Max concurrent torrents |
| `maxTorrentSizeGb` | 20 | Max single torrent size |
| `privateTrackerLimit` | 5 | Max private tracker downloads per day |

Admins bypass ALL limits.

### Daily Reset
- `downloadsToday` counter
- Reset happens automatically based on `downloadsResetAt` timestamp
- Checked against start of current day

## Brute Force Protection

### Configuration
| Setting | Default | Description |
|---------|---------|-------------|
| `maxAttemptsPerIp` | Configurable | Failed attempts before block |
| `ipBlockDurationMinutes` | Configurable | Block duration |
| `windowMinutes` | Configurable | Time window for counting |

### Behavior
- Tracks login attempts per IP and username
- Blocks IP after exceeding threshold
- Blocks apply across all usernames
- Admin can view stats, blocked IPs, and unblock

### Middleware
Server middleware (`server/middleware/brute-force.ts`) intercepts POST requests to `/api/auth/login` and checks IP block status before processing.

## Account Expiration

- Admin can set `expiresAt` date on user accounts
- Background plugin checks every 15 minutes
- Expired accounts are automatically disabled
- Login attempt on expired account returns 403
- Jellyfin user is also disabled on expiry

## Session Validation

Server middleware (`server/middleware/session-validate.ts`):
- Validates session exists in DB on every API request
- Clears invalid sessions automatically
- Touches `lastActiveAt` every 60 seconds
- Skips auth helper routes (`/_auth/`)

## User Creation

### Admin-Created Users
- Full control over all limits
- Can set `canSubmit`, `maxSessions`, `discordId`, `expiresAt`
- Jellyfin sync with custom library access and permissions

### Self-Registration
- Not supported by default
- Users must be created by admin
- Registration endpoint requires admin session

## Jellyfin Sync

When a user is created/updated/deleted in StreamHub:
1. Local DB operation completes first
2. Jellyfin user created/updated/disabled/deleted
3. Sync status tracked per provider (`synced`, `pending`, `failed`)
4. Password changes sync to Jellyfin
