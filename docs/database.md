# Database

## Overview

StreamHub uses **Drizzle ORM** with dual database support:
- **SQLite** (default) - file-based, zero config, stored at `.data/app.db`
- **PostgreSQL** - for production scale, configured via `DATABASE_URL`

The schema is defined in `server/database/schema.ts`. Migrations live in `server/database/migrations/`.

## Schema (13 Tables)

### Runtime Schema Resolver

`server/database/schema.ts` dynamically selects the correct schema at runtime based on `DB_DRIVER`:

```ts
const driver = process.env.DB_DRIVER ?? 'sqlite'
const schema = driver === 'postgres' ? pgSchema : sqliteSchemaRuntime
```

Both schemas define identical table and column names. The type-level cast to SQLite types ensures TypeScript compatibility. The actual PG/SQLite type mapping is handled by the DB instance created via `drivers/`.

### `users`
Core user accounts.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | UUID |
| `username` | text UNIQUE | Login name |
| `password` | text | bcrypt hash (12 rounds) |
| `role` | text enum | `user` or `admin` |
| `isActive` | boolean | Account enabled/disabled |
| `dailyDownloadLimit` | integer | Max downloads per day (default: 5) |
| `activeTorrentLimit` | integer | Max concurrent torrents (default: 3) |
| `maxTorrentSizeGb` | integer | Max single torrent size in GB (default: 20) |
| `privateTrackerLimit` | integer | Max private tracker downloads per day (default: 5) |
| `downloadsToday` | integer | Counter (reset daily) |
| `canSubmit` | boolean | Can submit torrent requests |
| `maxSessions` | integer | Max concurrent sessions (0 = unlimited) |
| `expiresAt` | text | Auto-disable date (ISO 8601) |
| `syncStatus` | text enum | `synced`, `pending`, or `failed` |
| `avatarUrl` | text | Path to avatar image |
| `discordId` | text | Discord user ID (for mentions) |

### `downloads`
Torrent download records.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | UUID |
| `userId` | text FK | Owner |
| `magnetLink` | text | Magnet, download URL, or `guid:` prefix |
| `savePath` | text enum | `movies`, `series`, `games`, `books`, `music` |
| `status` | text enum | `pending`, `downloading`, `completed`, `failed`, `paused`, `removed`, `disk_full` |
| `torrentHash` | text | qBittorrent hash |
| `progress` | real | 0.0 to 1.0 |
| `etaSeconds` | integer | Estimated time remaining |
| `downloadSpeed` | integer | Bytes/sec |
| `uploadSpeed` | integer | Bytes/sec |
| `sizeBytes` | integer | Total size |
| `downloadedBytes` | integer | Downloaded bytes |
| `numSeeds` / `numLeechs` | integer | Seeder/leecher counts |
| `isPrivate` | boolean | From a private tracker |
| `tmdbId` | integer | TMDB media ID |
| `mediaType` | text enum | `movie` or `tv` |
| `posterUrl` | text | Poster image URL |

### `requests`
Media requests from users.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | UUID |
| `userId` / `username` | text | Requester |
| `mediaType` / `mediaId` / `mediaTitle` | - | Media identification |
| `status` | text enum | `pending`, `accepted`, `rejected` |
| `userNote` / `adminNote` | text | Notes |
| `createdAt` / `updatedAt` | text | Timestamps |

### `settings`
Key-value store for runtime configuration.

| Column | Type |
|--------|------|
| `key` | text PK |
| `value` | text |

### `sessions`
Active user sessions.

| Column | Type |
|--------|------|
| `id` | text PK |
| `userId` | text FK |
| `ip` / `userAgent` / `deviceName` | text |
| `createdAt` / `lastActiveAt` | text |

When a user is deleted, all of their active sessions are removed automatically.

### `custom_trackers`
Private tracker configurations.

| Column | Type | Description |
|--------|------|-------------|
| `indexerName` | text UNIQUE | Tracker name |
| `trackerType` | text enum | `guid` or `counting` |
| `cookie` | text | Session cookie |
| `loginUrl` / `loginUsername` / `loginPassword` | text | Login credentials (password AES encrypted) |
| `enabled` | boolean | Active toggle |

### `login_attempts`
Brute force tracking.

Indexed on `(ip, created_at)`, `(username, created_at)`, and `(created_at)`.

### `wishlist`
User media wishlists.

Unique constraint on `(userId, mediaType, mediaId)`.

### `notifications`
In-app notifications.

Indexed on `(userId)` and `(userId, read)`.

### `push_subscriptions`
Web Push (VAPID) subscriptions.

Indexed on `(userId)` and `(endpoint)`.

### `sync_providers`
Jellyfin user mappings.

Unique on `(userId, providerName)`. Tracks `syncStatus` per provider.

### `sync_user_settings`
Per-user Jellyfin permissions.

Stores library access, transcoding, Live TV, and session limits.

### `activity_logs`
Audit trail for admin actions and login events.

## Migrations

### Generate

```bash
pnpm db:generate
```

Creates migration SQL files for the configured driver: `server/database/migrations/` (SQLite) or `server/database/migrations/postgres/` (PostgreSQL).

### Run

```bash
pnpm db:migrate
```

Runs pending migrations for the driver selected by `DB_DRIVER` (default `sqlite`). Auto-runs on `pnpm dev` and Docker entrypoint.

### Studio

```bash
pnpm db:studio
```

Opens Drizzle Studio for visual database inspection.

## SQLite vs PostgreSQL

| Feature | SQLite | PostgreSQL |
|---------|--------|-----------|
| Setup | Zero config | Requires `DATABASE_URL` |
| File | `.data/app.db` | Remote server |
| Concurrency | Single writer | Full concurrency |
| Best for | Development, small deployments | Production, multi-user |

## Repository Layer

Data access is centralized through typed repositories in `server/repositories/`. Each table has a corresponding repo with a typed interface:

```ts
// Usage
const repos = await getReposAsync()
const user = await repos.users.findById(userId)
await repos.users.update(userId, { role: 'admin' })
```

Factory functions (`getRepos`, `getReposAsync`) create and cache repo instances. Both SQLite and PostgreSQL share the same repo interface - the `dbGet`/`dbAll`/`dbRun` helpers handle dialect differences at runtime.

### Why repos over raw drizzle queries?

- **Type safety**: Each repo method has typed input/output (see `server/types/entities.ts`)
- **Testability**: Tests mock `getReposAsync()` instead of entire drizzle query chains
- **Consistency**: Single place to add cross-cutting concerns (logging, validation)
- **PG compatibility**: Repos use `useDbAsync()` internally, safe for both dialects

## Entity Types

All entity types are in `server/types/entities.ts` - the single source of truth for app-level types:

| Type | Description |
|------|-------------|
| `User` | Full user record (all columns) |
| `CreateUserInput` | Required fields for user creation |
| `UpdateUserInput` | Partial user update |
| `Download` | Download record |
| `CreateDownloadInput` / `UpdateDownloadInput` | Download mutations |
| `Setting` | Key-value setting |
| `Session` | Active session |
| `Request` | Media request |
| `Notification` | In-app notification |
| `CustomTracker` | Private tracker config |
| `ActivityLog` | Audit trail entry |
| `LoginAttempt` | Brute force tracking |
| `PushSubscription` | Web Push subscription |
| `WishlistItem` | Wishlist entry |
| `SyncProvider` | Jellyfin user mapping |
| `SyncUserSettings` | Per-user Jellyfin permissions |

### Driver Selection

Set `DB_DRIVER=postgres` in `.env` and provide `DATABASE_URL`:

```env
DB_DRIVER=postgres
DATABASE_URL=postgresql://streamhub:changeme@localhost:5432/streamhub
```

### Migration Script

For existing SQLite data, export from SQLite and import into PostgreSQL manually.
