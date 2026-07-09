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

### Optional — Paths

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_SAVE_PATH_MOVIES` | `/media/Movies` | qBittorrent save path for movies |
| `NUXT_SAVE_PATH_SERIES` | `/media/Series` | qBittorrent save path for series |
| `NUXT_SAVE_PATH_GAMES` | `/media/Games` | qBittorrent save path for games |
| `NUXT_SAVE_PATH_BOOKS` | `/media/Books` | qBittorrent save path for books |
| `NUXT_SAVE_PATH_MUSIC` | `/media/Music` | qBittorrent save path for music |

### Optional — Integrations

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

### Optional — Disk Space

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_DISKS` | - | Comma-separated mount paths for disk checks |
| `NUXT_MIN_FREE_SPACE_GB` | `7` | Minimum free GB required per disk |
| `NUXT_DISK_SPACE_CHECK_ENABLED` | `true` | Enable/disable disk space checks |

### Optional — Other

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_TORRENT_SYNC_INTERVAL_MS` | `10000` | Background torrent sync interval (ms) |
| `DB_DRIVER` | `sqlite` | Database driver: `sqlite` or `postgres` |
| `DATABASE_URL` | - | PostgreSQL connection URL (required when `DB_DRIVER=postgres`) |

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
  DISCORD_LOCALE: 'discord_locale'
} as const

export type SettingKey = (typeof SETTINGS)[keyof typeof SETTINGS]
```

The `getSetting()`, `putSetting()`, and `deleteSetting()` functions in `server/utils/settings.ts` accept `SettingKey` type — using an invalid key is a TypeScript compile error.

## Runtime Settings (Admin Panel)

Some settings are stored in the `settings` DB table and can be changed at runtime without restart:

| Setting | Default | Description |
|---------|---------|-------------|
| `disk_check_enabled` | `true` | Enable/disable disk space checks |
| `disk_min_free_gb` | `7` | Minimum free GB per disk |
| `prep_countdown_enabled` | `true` | Show prep countdown for completed downloads |
| `prep_speed_mb` | `15` | Simulated file copy speed (MB/s) |
| `discord_locale` | `pl` | Discord webhook language (`pl` or `en`) |
| `discord_mentions_enabled` | `true` | Enable user mentions in Discord notifications |
| `jellyfin_sync_enabled` | `false` | Enable Jellyfin user sync |

## Zod Validation

Config is validated at startup using Zod schemas (`server/utils/config-schema.ts`). Invalid config causes the server to exit with a descriptive error message.

## Docker Environment

For Docker deployments, set environment variables in `.env` or `docker-compose.yml`. The entrypoint script runs migrations automatically before starting the application.
