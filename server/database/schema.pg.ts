import { pgTable, text, integer, real, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  role: text('role', { enum: ['user', 'admin'] })
    .notNull()
    .default('user'),
  isActive: boolean('is_active').notNull().default(true),
  dailyDownloadLimit: integer('daily_download_limit').notNull().default(5),
  activeTorrentLimit: integer('active_torrent_limit').notNull().default(3),
  maxTorrentSizeGb: integer('max_torrent_size_gb').notNull().default(20),
  privateTrackerLimit: integer('private_tracker_limit').notNull().default(5),
  downloadsToday: integer('downloads_today').notNull().default(0),
  downloadsResetAt: text('downloads_reset_at'),
  createdAt: text('created_at').notNull().default(''),
  discordId: text('discord_id'),
  canSubmit: boolean('can_submit').notNull().default(false),
  maxSessions: integer('max_sessions').notNull().default(0),
  avatarUrl: text('avatar_url'),
  expiresAt: text('expires_at'),
  syncStatus: text('sync_status', { enum: ['synced', 'pending', 'failed'] })
    .notNull()
    .default('synced')
})

export const downloads = pgTable(
  'downloads',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    label: text('label').notNull().default(''),
    torrentName: text('torrent_name').notNull().default(''),
    magnetLink: text('magnet_link').notNull(),
    savePath: text('save_path', { enum: ['movies', 'series', 'games', 'books', 'music'] }).notNull(),
    status: text('status', {
      enum: ['pending', 'downloading', 'completed', 'failed', 'paused', 'removed', 'disk_full']
    })
      .notNull()
      .default('pending'),
    torrentHash: text('torrent_hash'),
    progress: real('progress').notNull().default(0),
    etaSeconds: integer('eta_seconds').notNull().default(0),
    downloadSpeed: integer('download_speed').notNull().default(0),
    uploadSpeed: integer('upload_speed').notNull().default(0),
    sizeBytes: integer('size_bytes').notNull().default(0),
    downloadedBytes: integer('downloaded_bytes').notNull().default(0),
    numSeeds: integer('num_seeds').notNull().default(0),
    numLeechs: integer('num_leechs').notNull().default(0),
    createdAt: text('created_at').notNull().default(''),
    completedAt: text('completed_at'),
    notifiedAt: text('notified_at'),
    tmdbId: integer('tmdb_id'),
    mediaType: text('media_type', { enum: ['movie', 'tv'] }),
    posterUrl: text('poster_url'),
    isPrivate: boolean('is_private').notNull().default(false)
  },
  // Serves the hot query paths: per-user limit/active checks (user_id + status),
  // torrent-sync global status scans (status), per-user history and range counts (user_id + created_at)
  (t) => [
    index('idx_downloads_user_status').on(t.userId, t.status),
    index('idx_downloads_status').on(t.status),
    index('idx_downloads_user_created').on(t.userId, t.createdAt)
  ]
)

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const activityLogs = pgTable('activity_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  username: text('username'),
  action: text('action').notNull(),
  details: text('details'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull()
})

export const requests = pgTable('requests', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  username: text('username').notNull(),
  mediaType: text('media_type', { enum: ['movie', 'tv'] }).notNull(),
  mediaId: integer('media_id').notNull(),
  mediaTitle: text('media_title').notNull(),
  mediaPoster: text('media_poster'),
  status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
    .notNull()
    .default('pending'),
  userNote: text('user_note'),
  adminNote: text('admin_note'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at')
})

export const customTrackers = pgTable(
  'custom_trackers',
  {
    id: text('id').primaryKey(),
    indexerName: text('indexer_name').notNull(),
    trackerType: text('tracker_type', { enum: ['guid', 'counting'] })
      .notNull()
      .default('counting'),
    cookie: text('cookie').notNull().default(''),
    loginUrl: text('login_url'),
    loginUsername: text('login_username'),
    loginPassword: text('login_password'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: text('created_at').notNull().default('')
  },
  (t) => [uniqueIndex('idx_custom_trackers_indexer').on(t.indexerName)]
)

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: text('id').primaryKey(),
    ip: text('ip').notNull(),
    username: text('username'),
    success: boolean('success').notNull().default(false),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull().default('')
  },
  (t) => [
    index('idx_login_attempts_ip').on(t.ip, t.createdAt),
    index('idx_login_attempts_username').on(t.username, t.createdAt),
    index('idx_login_attempts_created').on(t.createdAt)
  ]
)

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    deviceName: text('device_name'),
    createdAt: text('created_at').notNull(),
    lastActiveAt: text('last_active_at').notNull()
  },
  (t) => [index('idx_sessions_user').on(t.userId)]
)

export const wishlist = pgTable(
  'wishlist',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    mediaType: text('media_type', { enum: ['movie', 'tv'] }).notNull(),
    mediaId: integer('media_id').notNull(),
    mediaTitle: text('media_title').notNull(),
    mediaPoster: text('media_poster'),
    createdAt: text('created_at').notNull()
  },
  (t) => [uniqueIndex('idx_wishlist_user_media').on(t.userId, t.mediaType, t.mediaId)]
)

export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    link: text('link'),
    data: text('data'),
    read: boolean('read').notNull().default(false),
    createdAt: text('created_at').notNull()
  },
  (t) => [index('idx_notifications_user').on(t.userId), index('idx_notifications_user_read').on(t.userId, t.read)]
)

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at')
  },
  (t) => [index('idx_push_subscriptions_user').on(t.userId), index('idx_push_subscriptions_endpoint').on(t.endpoint)]
)

export const syncProviders = pgTable(
  'sync_providers',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    providerName: text('provider_name').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    syncStatus: text('sync_status', { enum: ['synced', 'pending', 'failed'] })
      .notNull()
      .default('synced'),
    lastSyncError: text('last_sync_error'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default('')
  },
  (t) => [
    index('idx_sync_providers_user').on(t.userId),
    uniqueIndex('idx_sync_providers_user_provider').on(t.userId, t.providerName)
  ]
)

export const syncUserSettings = pgTable(
  'sync_user_settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    providerName: text('provider_name').notNull(),
    libraryAccess: text('library_access').notNull().default('all'),
    enableVideoTranscoding: boolean('enable_video_transcoding').notNull().default(true),
    enableAudioTranscoding: boolean('enable_audio_transcoding').notNull().default(true),
    enableRemuxing: boolean('enable_remuxing').notNull().default(true),
    enableLiveTvAccess: boolean('enable_live_tv_access').notNull().default(true),
    enableLiveTvManagement: boolean('enable_live_tv_management').notNull().default(false),
    maxActiveSessions: integer('max_active_sessions').notNull().default(0),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default('')
  },
  (t) => [
    index('idx_sync_user_settings_user').on(t.userId),
    uniqueIndex('idx_sync_user_settings_user_provider').on(t.userId, t.providerName)
  ]
)
