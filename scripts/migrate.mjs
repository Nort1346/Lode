#!/usr/bin/env node

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

try {
  process.loadEnvFile()
} catch {
  /* no-op */
}

const cwd = process.cwd()
const driver = process.env.DB_DRIVER ?? 'sqlite'

const migrationsFolder = resolve(cwd, 'server/database/migrations')

if (!existsSync(migrationsFolder)) {
  console.error(`[migrate] Migrations folder not found: ${migrationsFolder}`)
  process.exit(1)
}

console.log(`[migrate] Driver: ${driver}`)
console.log(`[migrate] Migrations: ${migrationsFolder}`)

const rootModules = resolve(cwd, 'node_modules')
const outputModules = resolve(cwd, '.output/server/node_modules')
const modulesPath = process.env.MODULES_PATH ?? (existsSync(rootModules) ? rootModules : outputModules)

console.log(`[migrate] Modules: ${modulesPath}`)

const u = (pkg) => pathToFileURL(resolve(modulesPath, pkg)).href

if (driver === 'postgres') {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('[migrate] DATABASE_URL is required for PostgreSQL.')
    process.exit(1)
  }

  const { default: postgres } = await import(u('postgres'))

  const pgMigrationsFolder = resolve(cwd, 'server/database/migrations/postgres')
  const journalPath = resolve(pgMigrationsFolder, 'meta', '_journal.json')
  if (!existsSync(journalPath)) {
    console.error('[migrate] No _journal.json found for PostgreSQL migrations')
    process.exit(1)
  }

  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  const client = postgres(connectionString)

  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `)

  const lastRow = await client.unsafe('SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1')
  const lastTimestamp = lastRow[0]?.created_at ?? 0

  let applied = 0

  for (const entry of journal.entries) {
    if (lastTimestamp >= entry.when) continue

    const sqlPath = resolve(pgMigrationsFolder, `${entry.tag}.sql`)
    if (!existsSync(sqlPath)) {
      console.error(`[migrate] SQL file not found: ${sqlPath}`)
      continue
    }

    const sql = readFileSync(sqlPath, 'utf8')
    const hash = createHash('sha256').update(sql).digest('hex')
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    console.log(`[migrate] Running ${entry.tag} (${statements.length} statements)...`)

    for (const stmt of statements) {
      try {
        await client.unsafe(stmt)
      } catch (err) {
        if (/already exists/i.test(err.message) || /already exists/i.test(err.message)) {
          console.log(`[migrate]   Skipping (already exists): ${stmt.substring(0, 60)}...`)
        } else if (/column .* already exists/i.test(err.message)) {
          console.log(`[migrate]   Skipping (duplicate column): ${stmt.substring(0, 60)}...`)
        } else {
          console.error(`[migrate]   Failed: ${stmt.substring(0, 80)}`)
          console.error(`[migrate]   Error: ${err.message}`)
          await client.end()
          process.exit(1)
        }
      }
    }

    await client.unsafe('INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES ($1, $2)', [hash, entry.when])
    applied++
    console.log(`[migrate]   Applied: ${entry.tag}`)
  }

  if (applied === 0) {
    console.log('[migrate] No pending migrations.')
  } else {
    console.log(`[migrate] Applied ${applied} migration(s).`)
  }

  await client.end()
} else {
  const { default: Database } = await import(u('better-sqlite3/lib/index.js'))

  const dataDir = resolve(cwd, '.data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  const dbPath = resolve(dataDir, 'app.db')
  console.log(`[migrate] Database: ${dbPath}`)

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const journalPath = resolve(migrationsFolder, 'meta', '_journal.json')
  if (!existsSync(journalPath)) {
    console.error('[migrate] No _journal.json found')
    sqlite.close()
    process.exit(1)
  }

  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `)

  const lastRow = sqlite.prepare('SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1').get()
  const lastTimestamp = lastRow?.created_at ?? 0

  let applied = 0

  for (const entry of journal.entries) {
    if (lastTimestamp >= entry.when) continue

    const sqlPath = resolve(migrationsFolder, `${entry.tag}.sql`)
    if (!existsSync(sqlPath)) {
      console.error(`[migrate] SQL file not found: ${sqlPath}`)
      continue
    }

    const sql = readFileSync(sqlPath, 'utf8')
    const hash = createHash('sha256').update(sql).digest('hex')
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    console.log(`[migrate] Running ${entry.tag} (${statements.length} statements)...`)

    for (const stmt of statements) {
      try {
        sqlite.exec(stmt)
      } catch (err) {
        if (err.code === 'SQLITE_ERROR' && /already exists/i.test(err.message)) {
          console.log(`[migrate]   Skipping (already exists): ${stmt.substring(0, 60)}...`)
        } else if (err.code === 'SQLITE_ERROR' && /duplicate column/i.test(err.message)) {
          console.log(`[migrate]   Skipping (duplicate column): ${stmt.substring(0, 60)}...`)
        } else {
          console.error(`[migrate]   Failed: ${stmt.substring(0, 80)}`)
          console.error(`[migrate]   Error: ${err.message}`)
          sqlite.close()
          process.exit(1)
        }
      }
    }

    sqlite.prepare('INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES (?, ?)').run(hash, entry.when)
    applied++
    console.log(`[migrate]   Applied: ${entry.tag}`)
  }

  if (applied === 0) {
    console.log('[migrate] No pending migrations.')
  } else {
    console.log(`[migrate] Applied ${applied} migration(s).`)
  }

  sqlite.close()
}
