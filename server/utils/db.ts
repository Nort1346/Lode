import { createSqliteDb } from '#server/database/drivers/sqlite'
import type { SqliteDb, AppDb } from '#server/types/database'

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

let _pgDb: AppDb | null = null

/**
 * Returns a database instance for the configured driver.
 * Returns SqliteDb (sync) or PgDb (async) at runtime — the helpers
 * dbGet/dbAll/dbRun detect the driver via duck-typing and handle both.
 * This cast to SqliteDb is intentional: the repo layer (Phase 3) will
 * replace direct db access with properly typed repo methods.
 */
export async function useDbAsync(): Promise<SqliteDb> {
  const driver = process.env.DB_DRIVER ?? 'sqlite'

  if (driver !== 'postgres') {
    return useDb()
  }

  if (_pgDb !== null) return _pgDb as SqliteDb

  const { createPostgresDb } = await import('#server/database/drivers/postgres')
  _pgDb = await createPostgresDb()
  return _pgDb as unknown as SqliteDb
}

function hasMethod(obj: unknown, method: string): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    method in obj &&
    typeof (obj as Record<string, unknown>)[method] === 'function'
  )
}

export async function dbGet<T>(chain: { get(): T | undefined } | PromiseLike<T[]>): Promise<T | undefined> {
  if (hasMethod(chain, 'get')) {
    return (chain as { get(): T | undefined }).get()
  }
  const rows = await (chain as PromiseLike<T[]>)
  return rows[0]
}

export async function dbAll<T>(chain: { all(): T[] } | PromiseLike<T[]>): Promise<T[]> {
  if (hasMethod(chain, 'all')) {
    return (chain as { all(): T[] }).all()
  }
  return await (chain as PromiseLike<T[]>)
}

export async function dbRun(
  chain: { run(): { changes?: number } } | PromiseLike<unknown>
): Promise<{ changes: number }> {
  if (hasMethod(chain, 'run')) {
    const result = (chain as { run(): { changes?: number } }).run()
    return { changes: result.changes ?? 0 }
  }
  const result = (await chain) as { rowCount?: number }
  return { changes: result.rowCount ?? 0 }
}
