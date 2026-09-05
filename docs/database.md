# Database

## Overview

Lode uses **Drizzle ORM** with dual database support:
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
| `role` | text enum | `user` or `admin` (default `user`) |
| `is_active` | boolean | Account enabled/disabled (default true) |
| `daily_download_limit` | integer | Max downloads per day (default 5) |
| `active_torrent_limit` | integer | Max concurrent torrents (default 3) |
| `max_torrent_size_gb` | integer | Max single torrent size in GB (default 20) |
| `private_tracker_limit` | integer | Max private tracker downloads per day (default 5) |
| `downloads_today` | integer | Counter (reset daily) |
| `downloads_reset_at` | text | Last counter reset (ISO 8601) |
| `created_at` | text | Creation timestamp (ISO 8601) |
| `discord_id` | text | Discord user ID (for mentions) |
| `can_submit` | boolean | Can submit torrent requests (default false) |
| `max_sessions` | integer | Max concurrent sessions (0 = unlimited) |
| `avatar_url` | text | Path to avatar image |
| `expires_at` | text | Auto-disable date (ISO 8601) |
| `sync_status` | text enum | `synced`, `pending`, or `failed` (default `synced`) |

### `downloads`
Torrent download records.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | UUID |
| `user_id` | text FK | Owner |
| `label` | text | Human-readable media name |
| `torrent_name` | text | Tracker torrent title |
| `magnet_link` | text | Magnet, download URL, or `guid:` prefix |
| `save_path` | text enum | `movies`, `series`, `games`, `books`, `music` |
| `status` | text enum | `pending`, `downloading`, `completed`, `failed`, `paused`, `removed`, `disk_full` (default `pending`) |
| `torrent_hash` | text | qBittorrent hash |
| `progress` | real | 0.0 to 1.0 |
| `eta_seconds` | integer | Estimated time remaining |
| `download_speed` / `upload_speed` | integer | Bytes/sec |
| `size_bytes` / `downloaded_bytes` | integer | Total / downloaded size |
| `num_seeds` / `num_leechs` | integer | Seeder/leecher counts |
| `created_at` | text | Creation timestamp (ISO 8601) |
| `completed_at` | text | Completion timestamp (ISO 8601) |
| `tmdb_id` | integer | TMDB media ID |
| `media_type` | text enum | `movie` or `tv` |
| `poster_url` | text | Poster image URL |
| `is_private` | boolean | From a private tracker (default false) |

Indexed on `(user_id, status)`, `(status)`, and `(user_id, created_at)`.

### `requests`
Media requests from users.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | UUID |
| `user_id` / `username` | text | Requester |
| `media_type` / `media_id` / `media_title` | - | Media identification |
| `media_poster` | text | Poster image URL |
| `status` | text enum | `pending`, `accepted`, `rejected` (default `pending`) |
| `user_note` / `admin_note` | text | Notes |
| `created_at` / `updated_at` | text | Timestamps (ISO 8601) |

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
| `user_id` | text FK |
| `ip` / `user_agent` / `device_name` | text |
| `created_at` / `last_active_at` | text |

When a user is deleted, all of their active sessions are removed automatically.

### `custom_trackers`
Private tracker configurations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | UUID |
| `indexer_name` | text UNIQUE | Tracker name |
| `tracker_type` | text enum | `guid` or `counting` (default `counting`) |
| `cookie` | text | Session cookie |
| `login_url` / `login_username` / `login_password` | text | Login credentials (password AES encrypted) |
| `enabled` | boolean | Active toggle (default true) |
| `created_at` | text | Creation timestamp (ISO 8601) |

### `login_attempts`
Brute force tracking.

Indexed on `(ip, created_at)`, `(username, created_at)`, and `(created_at)`.

### `wishlist`
User media wishlists.

Unique constraint on `(user_id, media_type, media_id)`.

### `notifications`
In-app notifications.

Indexed on `(user_id)` and `(user_id, read)`.

### `push_subscriptions`
Web Push (VAPID) subscriptions.

Indexed on `(userId)` and `(endpoint)`.

### `sync_providers`
Jellyfin user mappings.

Unique on `(user_id, provider_name)`. Tracks `sync_status` per provider.

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
DATABASE_URL=postgresql://lode:changeme@localhost:5432/lode
```

### Migration Script

For existing SQLite data, export from SQLite and import into PostgreSQL manually.
