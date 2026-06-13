import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../database/schema'
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
      downloads_today INTEGER NOT NULL DEFAULT 0,
      downloads_reset_at TEXT,
      created_at TEXT NOT NULL DEFAULT ''
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
  `)

  const pragmaRows = sqlite.prepare('PRAGMA table_info(downloads)').all() as Record<string, unknown>[]
  const columns = pragmaRows.map((c) => c.name as string)
  if (!columns.includes('label')) {
    sqlite.exec(`ALTER TABLE downloads ADD COLUMN label TEXT NOT NULL DEFAULT ''`)
  }
  if (!columns.includes('completed_at')) {
    sqlite.exec(`ALTER TABLE downloads ADD COLUMN completed_at TEXT`)
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
