import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '#server/database/schema'
import { resolve } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

let _db: ReturnType<typeof drizzle> | null = null

function initDb() {
  const dataDir = resolve(process.cwd(), '.data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
  const sqlite = new Database(resolve(dataDir, 'app.db'))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_active INTEGER NOT NULL DEFAULT 1,
      daily_download_limit INTEGER NOT NULL DEFAULT 5,
      active_torrent_limit INTEGER NOT NULL DEFAULT 3,
      max_torrent_size_gb INTEGER NOT NULL DEFAULT 20,
      private_tracker_limit INTEGER NOT NULL DEFAULT 5,
      downloads_today INTEGER NOT NULL DEFAULT 0,
      downloads_reset_at TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      discord_id TEXT
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      torrent_name TEXT NOT NULL DEFAULT '',
      magnet_link TEXT NOT NULL,
      save_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      torrent_hash TEXT,
      progress REAL NOT NULL DEFAULT 0,
      eta_seconds INTEGER NOT NULL DEFAULT 0,
      download_speed INTEGER NOT NULL DEFAULT 0,
      upload_speed INTEGER NOT NULL DEFAULT 0,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      downloaded_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      media_type TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_title TEXT NOT NULL,
      media_poster TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      created_at TEXT NOT NULL
    );
  `)

  const pragmaRows = sqlite.prepare('PRAGMA table_info(downloads)').all() as Record<string, unknown>[]
  const columns = pragmaRows.map((c) => c.name as string)
  if (!columns.includes('label')) {
    sqlite.exec(`ALTER TABLE downloads ADD COLUMN label TEXT NOT NULL DEFAULT ''`)
  }
  if (!columns.includes('completed_at')) {
    sqlite.exec(`ALTER TABLE downloads ADD COLUMN completed_at TEXT`)
  }
  if (!columns.includes('num_seeds')) {
    sqlite.exec(`ALTER TABLE downloads ADD COLUMN num_seeds INTEGER NOT NULL DEFAULT 0`)
  }
  if (!columns.includes('num_leechs')) {
    sqlite.exec(`ALTER TABLE downloads ADD COLUMN num_leechs INTEGER NOT NULL DEFAULT 0`)
  }

  const userPragmaRows = sqlite.prepare('PRAGMA table_info(users)').all() as Record<string, unknown>[]
  const userColumns = userPragmaRows.map((c) => c.name as string)
  if (!userColumns.includes('private_tracker_limit')) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN private_tracker_limit INTEGER NOT NULL DEFAULT 5`)
  }
  if (!userColumns.includes('discord_id')) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN discord_id TEXT`)
  }
  if (!userColumns.includes('can_submit')) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN can_submit INTEGER NOT NULL DEFAULT 0`)
  }

  if (!columns.includes('tmdb_id')) {
    sqlite.exec(`ALTER TABLE downloads ADD COLUMN tmdb_id INTEGER`)
  }
  if (!columns.includes('media_type')) {
    sqlite.exec(`ALTER TABLE downloads ADD COLUMN media_type TEXT`)
  }
  if (!columns.includes('poster_url')) {
    sqlite.exec(`ALTER TABLE downloads ADD COLUMN poster_url TEXT`)
  }
  if (!columns.includes('is_private')) {
    sqlite.exec(`ALTER TABLE downloads ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0`)
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS custom_trackers (
      id TEXT PRIMARY KEY,
      indexer_name TEXT NOT NULL UNIQUE,
      cookie TEXT NOT NULL DEFAULT '',
      login_url TEXT,
      login_username TEXT,
      login_password TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT ''
    );
  `)

  const trackerPragmaRows = sqlite.prepare('PRAGMA table_info(custom_trackers)').all() as Record<string, unknown>[]
  const trackerColumns = trackerPragmaRows.map((c) => c.name as string)
  if (!trackerColumns.includes('tracker_type')) {
    sqlite.exec(`ALTER TABLE custom_trackers ADD COLUMN tracker_type TEXT NOT NULL DEFAULT 'counting'`)
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id TEXT PRIMARY KEY,
      ip TEXT NOT NULL,
      username TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT ''
    );
  `)

  const laPragmaRows = sqlite.prepare('PRAGMA table_info(login_attempts)').all() as Record<string, unknown>[]
  const laColumns = laPragmaRows.map((c) => c.name as string)
  if (!laColumns.includes('user_agent')) {
    sqlite.exec(`ALTER TABLE login_attempts ADD COLUMN user_agent TEXT`)
  }

  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, created_at)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username, created_at)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at)`)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS wishlist (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      media_type TEXT NOT NULL,
      media_id INTEGER NOT NULL,
      media_title TEXT NOT NULL,
      media_poster TEXT,
      created_at TEXT NOT NULL
    );
  `)
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlist_user_media ON wishlist(user_id, media_type, media_id)`)

  const reqPragmaRows = sqlite.prepare('PRAGMA table_info(requests)').all() as Record<string, unknown>[]
  const reqColumns = reqPragmaRows.map((c) => c.name as string)
  if (!reqColumns.includes('user_note')) {
    sqlite.exec(`ALTER TABLE requests ADD COLUMN user_note TEXT`)
  }
  if (!reqColumns.includes('admin_note')) {
    sqlite.exec(`ALTER TABLE requests ADD COLUMN admin_note TEXT`)
  }
  if (!reqColumns.includes('updated_at')) {
    sqlite.exec(`ALTER TABLE requests ADD COLUMN updated_at TEXT`)
  }

  _db = drizzle(sqlite, { schema })
  return _db
}

export function useDb() {
  if (!_db) {
    _db = initDb()
  }
  return _db
}
