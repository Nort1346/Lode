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
