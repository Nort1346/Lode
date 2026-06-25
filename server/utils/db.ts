import { createSqliteDb } from '#server/database/drivers/sqlite'
import type { SqliteDb } from '#server/types/database'

let _db: SqliteDb | null = null

export function useDb(): SqliteDb {
  if (!_db) {
    const driver = process.env.DB_DRIVER ?? 'sqlite'

    if (driver === 'postgres') {
      throw new Error('PostgreSQL is async — use useDbAsync() in async contexts or ensure DB_DRIVER=sqlite.')
    }

    _db = createSqliteDb()
  }
  return _db
}

let _pgDb: unknown = null

export async function useDbAsync(): Promise<SqliteDb> {
  const driver = process.env.DB_DRIVER ?? 'sqlite'

  if (driver !== 'postgres') {
    return useDb()
  }

  if (_pgDb !== null) return _pgDb as SqliteDb

  const { createPostgresDb } = await import('#server/database/drivers/postgres')
  _pgDb = await createPostgresDb()
  return _pgDb as SqliteDb
}
