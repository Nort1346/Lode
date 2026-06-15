import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  role: text('role', { enum: ['user', 'admin'] })
    .notNull()
    .default('user'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  dailyDownloadLimit: integer('daily_download_limit').notNull().default(5),
  activeTorrentLimit: integer('active_torrent_limit').notNull().default(3),
  maxTorrentSizeGb: integer('max_torrent_size_gb').notNull().default(20),
  downloadsToday: integer('downloads_today').notNull().default(0),
  downloadsResetAt: text('downloads_reset_at'),
  createdAt: text('created_at').notNull().default('')
})

export const downloads = sqliteTable('downloads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  label: text('label').notNull().default(''),
  torrentName: text('torrent_name').notNull().default(''),
  magnetLink: text('magnet_link').notNull(),
  savePath: text('save_path', { enum: ['movies', 'series', 'games', 'books', 'music'] }).notNull(),
  status: text('status', { enum: ['pending', 'downloading', 'completed', 'failed', 'paused', 'removed'] })
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
  completedAt: text('completed_at')
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const activityLogs = sqliteTable('activity_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  username: text('username'),
  action: text('action').notNull(),
  details: text('details'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull()
})

export const requests = sqliteTable('requests', {
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
  note: text('note'),
  createdAt: text('created_at').notNull()
})
