import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../schema'
import { resolve } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import type { SqliteDb } from '#server/types/database'

export function createSqliteDb(): SqliteDb {
  const dataDir = resolve(process.cwd(), '.data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  const sqlite = new Database(resolve(dataDir, 'app.db'))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  return drizzle(sqlite, { schema })
}
