/**
 * Cross-database fixtures for the SQLite/PostgreSQL parity suite.
 *
 * Instead of hand-written DDL (which can drift from the real schema), each
 * fixture applies the SAME migration chains that production uses:
 *   - SQLite:     server/database/migrations/*.sql
 *   - PostgreSQL: server/database/migrations/postgres/*.sql
 *
 * The returned `db` handle is the same duck-typed surface the production
 * code uses (see useDbAsync() in #server/utils/db): repositories call only
 * the shared drizzle API and dbGet/dbAll/dbRun bridge sync/async.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import type { Database as BetterSqlite3Database } from 'better-sqlite3'
import postgres from 'postgres'
import type { Sql } from 'postgres'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js'
import * as sqliteSchema from '#server/database/schema.sqlite'
import * as pgSchema from '#server/database/schema.pg'
import type { SqliteDb } from '#server/types/database'

export const STATEMENT_BREAKPOINT = '--> statement-breakpoint'

export type RawParam = string | number | null

export interface Fixture {
  kind: 'sqlite' | 'postgres'
  /** Duck-typed drizzle handle, exactly what repositories receive in production. */
  db: SqliteDb
  close(): Promise<void>
  /** Raw SELECT; rows are objects keyed by column name ($1..$n placeholders). */
  query(sql: string, params?: RawParam[]): Promise<Array<Record<string, unknown>>>
  /** Raw executable statement (DDL/DML). */
  exec(sql: string, params?: RawParam[]): Promise<void>
}

export function currentDriver(): 'sqlite' | 'postgres' {
  return (process.env.DB_DRIVER ?? 'sqlite').toLowerCase() === 'postgres' ? 'postgres' : 'sqlite'
}

/** PostgreSQL tests are opt-in: they need a reachable server URL. */
export function pgTestUrl(): string | undefined {
  const url = process.env.LODE_PG_TEST_URL
  return url !== undefined && url !== '' ? url : undefined
}

/** True when the current project can run driver-dependent tests. */
export function canRunForDriver(): boolean {
  return currentDriver() !== 'postgres' || pgTestUrl() !== undefined
}

function splitStatements(sql: string): string[] {
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function listMigrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Mirrors the tolerance in scripts/migrate.mjs (idempotent re-runs).
function isBenignSqliteError(err: unknown): boolean {
  const code = (err as { code?: unknown }).code
  return code === 'SQLITE_ERROR' && (/already exists/i.test(messageOf(err)) || /duplicate column/i.test(messageOf(err)))
}

function isBenignPgError(err: unknown): boolean {
  return /already exists/i.test(messageOf(err))
}

function applySqliteMigrations(raw: BetterSqlite3Database): void {
  const dir = resolve(process.cwd(), 'server/database/migrations')
  for (const file of listMigrationFiles(dir)) {
    const sql = readFileSync(resolve(dir, file), 'utf8')
    for (const stmt of splitStatements(sql)) {
      try {
        raw.exec(stmt)
      } catch (err) {
        if (!isBenignSqliteError(err)) throw err
      }
    }
  }
}

async function applyPostgresMigrations(raw: Sql): Promise<void> {
  const dir = resolve(process.cwd(), 'server/database/migrations/postgres')
  for (const file of listMigrationFiles(dir)) {
    const sql = readFileSync(resolve(dir, file), 'utf8')
    for (const stmt of splitStatements(sql)) {
      try {
        await raw.unsafe(stmt)
      } catch (err) {
        if (!isBenignPgError(err)) throw err
      }
    }
  }
}

function withDatabase(url: string, dbName: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${dbName}`
  return parsed.toString()
}

/** Converts $1..$n placeholders to ? for better-sqlite3. */
function toSqlitePlaceholders(sql: string): string {
  return sql.replace(/\$(\d+)/g, '?')
}

export function createSqliteFixture(): Fixture {
  const raw = new Database(':memory:')
  raw.pragma('foreign_keys = ON')
  applySqliteMigrations(raw)
  return {
    kind: 'sqlite',
    // schema-aware instance, exactly like server/database/drivers/sqlite.ts
    db: drizzleSqlite(raw, { schema: sqliteSchema }) as unknown as SqliteDb,
    close: async () => {
      raw.close()
    },
    async query(sql, params = []) {
      return raw.prepare(toSqlitePlaceholders(sql)).all(...params) as Array<Record<string, unknown>>
    },
    async exec(sql, params = []) {
      raw.prepare(toSqlitePlaceholders(sql)).run(...params)
    }
  }
}

/**
 * Creates a throwaway PostgreSQL database (dropped if it exists), applies the
 * production PostgreSQL migrations, and returns a drizzle handle on it.
 * Each test file should use its own `dbName` so parallel workers never share a DB.
 */
export async function createPostgresFixture(dbName = 'lode_parity_test'): Promise<Fixture> {
  const maintainerUrl = pgTestUrl()
  if (maintainerUrl === undefined) {
    throw new Error('LODE_PG_TEST_URL is not set - PostgreSQL parity tests need a reachable server')
  }

  const maintainer = postgres(maintainerUrl, { max: 1, onnotice: () => {} })
  try {
    await maintainer.unsafe(`DROP DATABASE IF EXISTS ${dbName}`)
    await maintainer.unsafe(`CREATE DATABASE ${dbName}`)
  } finally {
    await maintainer.end()
  }

  const raw = postgres(withDatabase(maintainerUrl, dbName), { max: 1, onnotice: () => {} })
  try {
    await applyPostgresMigrations(raw)
  } catch (err) {
    await raw.end()
    throw err
  }

  return {
    kind: 'postgres',
    // schema-aware instance, exactly like server/database/drivers/postgres.ts
    db: drizzlePg(raw, { schema: pgSchema }) as unknown as SqliteDb,
    close: () => raw.end({ timeout: 5 }),
    async query(sql, params = []) {
      const rows = await raw.unsafe(sql, params)
      return rows as unknown as Array<Record<string, unknown>>
    },
    async exec(sql, params = []) {
      await raw.unsafe(sql, params)
    }
  }
}

export async function createFixture(dbName = 'lode_parity_test'): Promise<Fixture> {
  if (currentDriver() === 'postgres') {
    return createPostgresFixture(dbName)
  }
  return createSqliteFixture()
}
