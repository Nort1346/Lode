import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#server/database/schema'

export type SqliteDb = BetterSQLite3Database<typeof schema>
export type PgDb = PostgresJsDatabase<typeof schema>
export type AppDb = SqliteDb | PgDb
