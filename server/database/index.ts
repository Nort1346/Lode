import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { resolve } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

let _db: ReturnType<typeof drizzle> | null = null

export function useDb() {
  if (!_db) {
    const dataDir = resolve(process.cwd(), '.data')
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }
    const sqlite = new Database(resolve(dataDir, 'app.db'))
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    _db = drizzle(sqlite, { schema })
  }
  return _db
}
