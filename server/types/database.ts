import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as sqliteSchema from '#server/database/schema.sqlite'
import type * as pgSchema from '#server/database/schema.pg'

export type SqliteDb = BetterSQLite3Database<typeof sqliteSchema>
export type PgDb = PostgresJsDatabase<typeof pgSchema>
export type AppDb = SqliteDb | PgDb
