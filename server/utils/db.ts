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

function hasGetMethod(obj: unknown): obj is { get(): unknown } {
  return typeof obj === 'object' && obj !== null && 'get' in obj && typeof (obj as { get?: unknown }).get === 'function'
}

export async function dbGet<T>(chain: { get(): T | undefined } | PromiseLike<T[]>): Promise<T | undefined> {
  if (hasGetMethod(chain)) {
    return (chain as { get(): T | undefined }).get()
  }
  const rows = await (chain as PromiseLike<T[]>)
  return rows[0]
}

export async function dbAll<T>(chain: { all(): T[] } | PromiseLike<T[]>): Promise<T[]> {
  if (hasGetMethod(chain)) {
    return (chain as { all(): T[] }).all()
  }
  return await (chain as PromiseLike<T[]>)
}

export async function dbRun(
  chain: { run(): { changes?: number } } | PromiseLike<unknown>
): Promise<{ changes: number }> {
  if (hasGetMethod(chain)) {
    const result = (chain as { run(): { changes?: number } }).run()
    return { changes: result.changes ?? 0 }
  }
  const result = (await chain) as { rowCount?: number }
  return { changes: result.rowCount ?? 0 }
}
