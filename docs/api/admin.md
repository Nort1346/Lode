# Admin API

All admin endpoints require admin role authentication.

## Users

### List Users
```
GET /api/admin/users
```

Returns all users with Jellyfin sync info and settings.

### Create User
```
POST /api/admin/users
```

### Body
```json
{
  "username": "string",
  "password": "string",
  "role": "user",
  "dailyDownloadLimit": 5,
  "activeTorrentLimit": 3,
  "maxTorrentSizeGb": 20,
  "privateTrackerLimit": 5,
  "canSubmit": false,
  "maxSessions": 0,
  "discordId": null,
  "expiresAt": null,
  "jellyfinLibraryAccess": "all",
  "jellyfinEnableVideoTranscoding": true,
  "jellyfinEnableAudioTranscoding": true,
  "jellyfinEnableRemuxing": true,
  "jellyfinEnableLiveTvAccess": true,
  "jellyfinEnableLiveTvManagement": false,
  "jellyfinMaxActiveSessions": 0
}
```

### Update User
```
PUT /api/admin/users/[id]
```

Partial update — only send fields to change.

### Delete User
```
DELETE /api/admin/users/[id]
```

Cannot delete admin users. Jellyfin delete must succeed before local delete. All active sessions for the deleted user are also removed.

---

## Sessions

### List All Sessions
```
GET /api/admin/sessions
```

### Delete Session
```
DELETE /api/admin/sessions/[id]
```

### Delete All User Sessions
```
POST /api/admin/sessions/delete-all
```

### Body
```json
{ "userId": "uuid" }
```

---

## Trackers

### List Trackers
```
GET /api/admin/trackers
```

Passwords masked as `***`.

### Create Tracker
```
POST /api/admin/trackers
```

### Body
```json
{
  "indexerName": "TrackerName",
  "trackerType": "guid",
  "cookie": "session_cookie_value",
  "loginUrl": "https://...",
  "loginUsername": "user",
  "loginPassword": "pass"
}
```

Provide either `cookie` OR `loginUrl + loginUsername + loginPassword`.

### Update Tracker
```
PUT /api/admin/trackers/[id]
```

### Delete Tracker
```
DELETE /api/admin/trackers/[id]
```

### Test Login
```
POST /api/admin/trackers/test-login
```

### Body
```json
{
  "loginUrl": "https://...",
  "loginUsername": "user",
  "loginPassword": "pass"
}
```

Or omit to use stored credentials from `[id]` path.

---

## Brute Force

### Get Config
```
GET /api/admin/brute-force/config
```

### Update Config
```
PUT /api/admin/brute-force/config
```

### Body
```json
{
  "maxAttemptsPerIp": 5,
  "ipBlockDurationMinutes": 30,
  "windowMinutes": 15
}
```

### Get Stats
```
GET /api/admin/brute-force/stats
```

### Response
```json
{
  "stats": {
    "blockedIpsCount": 3,
    "recentAttempts24h": 150,
    "recentFailed24h": 12,
    "recentSuccess24h": 138
  }
}
```

### List Blocked IPs
```
GET /api/admin/brute-force/blocked-ips
```

### Unblock IP
```
DELETE /api/admin/brute-force/blocked-ips
```

### Body
```json
{ "ip": "192.168.1.100" }
```

---

## Ranking

### Get Config
```
GET /api/admin/ranking/config
```

### Update Config
```
PUT /api/admin/ranking/config
```

### Body
Full `RankingConfig` object (see [Ranking System](../features/ranking-system.md)).

### Reset Config
```
POST /api/admin/ranking/config.reset
```

---

## Jellyfin

### Get Presets
```
GET /api/admin/jellyfin/presets
```

### Update Presets
```
PUT /api/admin/jellyfin/presets
```

### Body
```json
{
  "syncEnabled": true,
  "libraryAccess": "all",
  "videoTranscoding": true,
  "audioTranscoding": true,
  "remuxing": true,
  "liveTvAccess": true,
  "liveTvManagement": false,
  "maxActiveSessions": 0
}
```

### Upload Avatar
```
POST /api/admin/jellyfin/avatar
```

Multipart form: `userId` (text) + `avatar` (image file).

### Delete Avatar
```
DELETE /api/admin/jellyfin/avatar
```

### Body
```json
{ "userId": "uuid" }
```

---

## Discord

### Get Locale
```
GET /api/admin/discord-locale
```

### Set Locale
```
PUT /api/admin/discord-locale
```

### Body
```json
{ "locale": "pl" }
```

### Get Mentions
```
GET /api/admin/discord-mentions
```

### Toggle Mentions
```
PUT /api/admin/discord-mentions
```

### Body
```json
{ "enabled": true }
```

---

## Sync

### Get Providers
```
GET /api/admin/sync/providers
```

### Get Libraries
```
GET /api/admin/sync/libraries
```

---

## Settings

### Get Settings
```
GET /api/admin/settings
```

### System Status
```
GET /api/admin/system-status
```

Returns health checks for qBittorrent, Prowlarr, Jellyfin, Redis, Discord, FlareSolverr.

### Disk Status
```
GET /api/admin/disk-status
```

### Update Disk Config
```
PUT /api/admin/disk-status
```

### Body
```json
{
  "minFreeSpaceGb": 7,
  "checkEnabled": true
}
```

### Prep Config
```
GET /api/admin/prep-config
```

### Update Prep Config
```
PUT /api/admin/prep-config
```

### Body
```json
{
  "enabled": true,
  "speedMb": 15
}
```

---

## Logs

### Activity Logs
```
GET /api/admin/logs?page=1&limit=50&action=login&userId=uuid
```

### Live Log Stream
```
GET /api/admin/logs-stream
```

SSE endpoint. Sends backfill of recent logs, then streams new logs in real-time.
