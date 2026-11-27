# Jellyfin Integration

## Overview

Lode integrates with Jellyfin media server for library detection, user synchronization, avatar management, and Live TV configuration.

## Configuration

Set in `.env`:

```env
NUXT_JELLYFIN_URL=http://localhost:8096
NUXT_JELLYFIN_API_KEY=your-api-key
# URL reachable from users' browsers, used by the Watch button
NUXT_JELLYFIN_EXTERNAL_URL=http://localhost:8096
```

## Watch Button

Titles already in the library show a **Watch** button on their movie/TV detail page. `GET /api/watch/links` resolves the TMDB ID to a Jellyfin item ID and returns deep links for the available players:

| Player | Link | Platforms |
|--------|------|-----------|
| Moonfin | `moonfin://item?id=<itemId>` | Android, iOS, macOS, Windows, Linux |
| Swiftfin | `jellyfin://<serverId>/<userId>/item/<itemId>` | iOS |
| Findroid | `jellyfin://item/<itemId>` | Android |
| Jellyfin web | `<externalUrl>/web/index.html#!/details?id=<itemId>&serverId=<id>` | Browser / PWA |
| Plex (native/web) | `plex://…` / `https://app.plex.tv/desktop#!/server/<id>/details?key=…` | Android, iOS / browser |
| Emby (native/web) | `emby://…` / `<externalUrl>/web/index.html#!/item?id=…` | Android, iOS / browser |

Every media server contributes both native players and its own web client. The native app is attempted first; if none opens, the fallback is the **web client of the same server** (Jellyfin web for Jellyfin titles, Plex Web for Plex titles, Emby Web for Emby titles). Browsers cannot reliably detect installed apps, so a failed native attempt falls back to that web UI; the dropdown next to the button lets users pick a specific player. `NUXT_JELLYFIN_EXTERNAL_URL` must be reachable from the user's device, not just from Lode (e.g. not a Docker-internal hostname).

The API is server-agnostic: `GET /api/watch/links` asks every active sync provider for a `WatchSource` and merges the results. Builders for all three servers live in `shared/watch.ts`; Plex and Emby links appear automatically once those providers are integrated.

## Library Detection

### How It Works
1. On browse requests, Lode fetches all TMDB IDs from Jellyfin libraries
2. Results are cached in-memory with an in-flight promise cache to prevent race conditions
3. Each browse item is checked against the cached set
4. Items in the library show an "In Library" badge

### Cache Strategy
- **In-flight cache**: Concurrent requests share the same promise
- **No TTL cache**: Re-fetched on server restart
- **Per-provider**: Each sync provider has its own `isItemInLibrary()` implementation

### BrowseItem vs SpotlightItem
- `BrowseItem`: `inLibrary` added via `markInLibrary()` intersection type
- `SpotlightItem`: Has `inLibrary: boolean` but always `false` (badges not shown on spotlights)

## User Sync

### SyncProvider Interface
```ts
interface SyncProvider {
  name: string
  isEnabled(): Promise<boolean>
  createUser(data: SyncUserData): Promise<string>
  updateUserPassword(providerUserId: string, password: string): Promise<void>
  findUserByName(username: string): Promise<string | null>
  updateUser(providerUserId: string, data: SyncUserData): Promise<void>
  deleteUser(providerUserId: string): Promise<void>
  disableUser(providerUserId: string): Promise<void>
  enableUser(providerUserId: string): Promise<void>
  updateUserSettings(providerUserId: string, settings: SyncUserSettings): Promise<void>
  setAvatar(providerUserId: string, imageBuffer: Buffer): Promise<void>
  deleteAvatar(providerUserId: string): Promise<void>
  getLibraries(): Promise<Array<SyncLibrary>>
  isItemInLibrary?(tmdbId: number): Promise<boolean>
}
```

### Sync Flow

**User Creation**:
1. Local DB insert FIRST (prevents orphan on sync failure)
2. Jellyfin user created with plain text password
3. Sync status updated to `synced` or `failed`
4. Settings applied (library access, transcoding, Live TV)

**User Update**:
1. Local DB update
2. Password changed in Jellyfin (if provided)
3. Settings updated
4. Enable/disable synced

**User Deletion**:
1. Jellyfin delete FIRST (prevents orphan)
2. If Jellyfin delete fails, Lode delete is ABORTED
3. Local DB delete only on success

### Sync Status
| Status | Meaning |
|--------|---------|
| `synced` | Successfully synced with Jellyfin |
| `pending` | Sync in progress |
| `failed` | Sync failed (error logged) |

## Avatar Management

- Upload: Validates image, processes with Sharp, saves to `public/avatars/`
- Syncs to Jellyfin as raw binary (NOT base64)
- Delete: Removes from both local storage and Jellyfin
- Displayed in sidebar and user management (centered within its container)

## Jellyfin Presets

Admin can configure default settings for new users:

| Setting | Default | Description |
|---------|---------|-------------|
| `syncEnabled` | `true` | Enable Jellyfin sync |
| `libraryAccess` | `all` | Library access (`all` or specific libraries) |
| `videoTranscoding` | `true` | Allow video transcoding |
| `audioTranscoding` | `true` | Allow audio transcoding |
| `remuxing` | `true` | Allow remuxing |
| `liveTvAccess` | `true` | Allow Live TV access |
| `liveTvManagement` | `false` | Allow Live TV management |
| `maxActiveSessions` | `0` | Max concurrent sessions (0 = unlimited) |

## Live TV

Configured per-user via Jellyfin policy:
- `EnableLiveTvAccess`: View Live TV channels
- `EnableLiveTvManagement`: Manage EPG and recordings

## Libraries API

Admin can view available Jellyfin libraries:
- GET `/api/admin/sync/libraries` - Lists all libraries with IDs
- Used for library access configuration per user
