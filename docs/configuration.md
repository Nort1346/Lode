# Configuration

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `NUXT_QBITTORRENT_URL` | qBittorrent WebUI URL (e.g. `http://localhost:8080`) |
| `NUXT_QBITTORRENT_API_KEY` | qBittorrent WebUI API key (Settings > Web UI > API Key) |
| `NUXT_SESSION_PASSWORD` | Session encryption key (32+ chars) |
| `NUXT_TMDB_API_KEY` | TMDB API v3 key (required for browse) |
| `NUXT_PROWLARR_URL` | Prowlarr base URL |
| `NUXT_PROWLARR_API_KEY` | Prowlarr API key |
| `NUXT_TRACKER_ENCRYPTION_KEY` | AES-256-GCM key for tracker passwords (64 hex chars) |

### Optional - Paths

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_SAVE_PATH_MOVIES` | `/data/Movies` | qBittorrent save path for movies (required by config validation) |
| `NUXT_SAVE_PATH_SERIES` | `/data/Series` | qBittorrent save path for series (required by config validation) |
| `NUXT_SAVE_PATH_GAMES` | (empty) | qBittorrent save path for games (optional) |
| `NUXT_SAVE_PATH_BOOKS` | (empty) | qBittorrent save path for books (optional) |
| `NUXT_SAVE_PATH_MUSIC` | (empty) | qBittorrent save path for music (optional) |

`.env.example` suggests `/media/*` paths for all five categories. Categories without a configured path are hidden from the UI via `GET /api/categories`.

### Optional - Integrations

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_REDIS_URL` | - | Redis connection URL (enables caching) |
| `NUXT_JELLYFIN_URL` | - | Jellyfin server URL |
| `NUXT_JELLYFIN_API_KEY` | - | Jellyfin API key |
| `NUXT_DISCORD_WEBHOOK_URL` | - | Discord webhook for download notifications |
| `NUXT_FLARESOLVERR_URL` | - | FlareSolverr URL for Cloudflare bypass |
| `NUXT_PUBLIC_VAPID_PUBLIC_KEY` | - | VAPID public key for Web Push API |
| `NUXT_VAPID_PRIVATE_KEY` | - | VAPID private key |
| `NUXT_VAPID_SUBJECT` | - | Contact email/URL for push service |

### Optional - Disk Space

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_DISKS` | - | Comma-separated mount paths for disk checks |
| `NUXT_MIN_FREE_SPACE_GB` | `7` | Minimum free GB required per disk |
| `NUXT_DISK_SPACE_CHECK_ENABLED` | `true` | Enable/disable disk space checks |

### Optional - Other

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_TORRENT_SYNC_INTERVAL_MS` | `10000` | Background torrent sync interval (ms; not listed in `.env.example`) |
| `DB_DRIVER` | `sqlite` | Database driver: `sqlite` or `postgres` |
| `DATABASE_URL` | - | PostgreSQL connection URL (required when `DB_DRIVER=postgres`) |
| `POSTGRES_PASSWORD` | - | Postgres password (passed to the `postgres` service via compose `env_file`; required for the postgres setup) |
| `TZ` | `UTC` | Container timezone (forwarded to qBittorrent) |

## SETTINGS Constant

All settings keys are centralized in `server/types/settings.ts` as a typed constant:

```ts
export const SETTINGS = {
  JELLYFIN_SYNC_ENABLED: 'jellyfin_sync_enabled',
  JELLYFIN_DEFAULT_LIBRARY_ACCESS: 'jellyfin_default_library_access',
  JELLYFIN_DEFAULT_VIDEO_TRANSCODING: 'jellyfin_default_video_transcoding',
  JELLYFIN_DEFAULT_AUDIO_TRANSCODING: 'jellyfin_default_audio_transcoding',
  JELLYFIN_DEFAULT_REMUXING: 'jellyfin_default_remuxing',
  JELLYFIN_DEFAULT_LIVE_TV_ACCESS: 'jellyfin_default_live_tv_access',
  JELLYFIN_DEFAULT_LIVE_TV_MANAGEMENT: 'jellyfin_default_live_tv_management',
  JELLYFIN_DEFAULT_MAX_ACTIVE_SESSIONS: 'jellyfin_default_max_active_sessions',
  RANKING_CONFIG: 'ranking_config',
  BRUTE_FORCE_CONFIG: 'brute_force_config',
  PREP_COUNTDOWN_ENABLED: 'prep_countdown_enabled',
  PREP_SPEED_MB: 'prep_speed_mb',
  DISK_CHECK_ENABLED: 'disk_check_enabled',
  DISK_MIN_FREE_GB: 'disk_min_free_gb',
  DISCORD_MENTIONS_ENABLED: 'discord_mentions_enabled',
  DISCORD_LOCALE: 'discord_locale',
  USER_DEFAULT_DAILY_DOWNLOAD_LIMIT: 'user_default_daily_download_limit',
  USER_DEFAULT_ACTIVE_TORRENT_LIMIT: 'user_default_active_torrent_limit',
  USER_DEFAULT_MAX_TORRENT_SIZE_GB: 'user_default_max_torrent_size_gb',
  USER_DEFAULT_PRIVATE_TRACKER_LIMIT: 'user_default_private_tracker_limit',
  USER_DEFAULT_MAX_SESSIONS: 'user_default_max_sessions',
  USER_DEFAULT_CAN_SUBMIT: 'user_default_can_submit'
} as const

export type SettingKey = (typeof SETTINGS)[keyof typeof SETTINGS]
```

The `getSetting()`, `putSetting()`, and `deleteSetting()` functions in `server/utils/settings.ts` accept `SettingKey` type - using an invalid key is a TypeScript compile error.

## Runtime Settings (Admin Panel)

Some settings are stored in the `settings` DB table and can be changed at runtime without restart:

| Setting | Default | Description |
|---------|---------|-------------|
| `disk_check_enabled` | `true` | Enable/disable disk space checks |
| `disk_min_free_gb` | `7` | Minimum free GB per disk |
| `prep_countdown_enabled` | `true` | Show prep countdown for completed downloads |
| `prep_speed_mb` | `15` | Simulated file copy speed (MB/s) |
| `discord_locale` | `en` | Discord webhook language (`pl`, `en`, `de`, `fr`, `es`) |
| `discord_mentions_enabled` | `true` | Enable user mentions in Discord notifications |
| `jellyfin_sync_enabled` | `false` | Enable Jellyfin user sync |
| `user_default_daily_download_limit` | `5` | Default daily download limit for new users |
| `user_default_active_torrent_limit` | `3` | Default active torrent limit for new users |
| `user_default_max_torrent_size_gb` | `20` | Default max torrent size (GB) for new users |
| `user_default_private_tracker_limit` | `5` | Default daily private tracker limit for new users |
| `user_default_max_sessions` | `0` | Default max concurrent sessions for new users (0 = unlimited) |
| `user_default_can_submit` | `false` | Default torrent submission permission for new users |

## Zod Validation

Config is validated at startup using Zod schemas (`server/utils/config-schema.ts`). Invalid config causes the server to exit with a descriptive error message.

## Docker Environment

For Docker deployments, set environment variables in `.env` or the compose file (`docker-compose.sqlite.yml` / `docker-compose.postgres.yml`). The entrypoint script runs migrations automatically before starting the application.
