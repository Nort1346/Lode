#!/usr/bin/env node

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, mkdirSync } from 'node:fs'

const cwd = process.cwd()
const driver = process.env.DB_DRIVER ?? 'sqlite'

const migrationsFolder = resolve(cwd, 'server/database/migrations')

if (!existsSync(migrationsFolder)) {
  console.error(`[migrate] Migrations folder not found: ${migrationsFolder}`)
  process.exit(1)
}

console.log(`[migrate] Driver: ${driver}`)
console.log(`[migrate] Migrations: ${migrationsFolder}`)

// Resolve modules path:
//   - Explicit override via MODULES_PATH env var
//   - Fallback: first existing of node_modules/ or .output/server/node_modules/
const rootModules = resolve(cwd, 'node_modules')
const outputModules = resolve(cwd, '.output/server/node_modules')
const modulesPath = process.env.MODULES_PATH ?? (existsSync(rootModules) ? rootModules : outputModules)

console.log(`[migrate] Modules: ${modulesPath}`)

const u = (pkg) => pathToFileURL(resolve(modulesPath, pkg)).href

async function runMigrations(migrateFn, db, client, opts) {
  try {
    await migrateFn(db, opts)
    console.log('[migrate] Done.')
  } catch (err) {
    console.error('[migrate] Migration failed:', err)
    process.exit(1)
  } finally {
    await client.end?.()
    client.close?.()
  }
}

if (driver === 'postgres') {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('[migrate] DATABASE_URL is required for PostgreSQL.')
    process.exit(1)
  }

  const { default: postgres } = await import(u('postgres'))
  const { drizzle } = await import(u('drizzle-orm/postgres-js/index.js'))
  const { migrate } = await import(u('drizzle-orm/postgres-js/migrator.js'))

  const client = postgres(connectionString)
  const db = drizzle(client)

  await runMigrations(migrate, db, client, { migrationsFolder })
} else {
  const { default: Database } = await import(u('better-sqlite3/lib/index.js'))
  const { drizzle } = await import(u('drizzle-orm/better-sqlite3/index.js'))
  const { migrate } = await import(u('drizzle-orm/better-sqlite3/migrator.js'))

  const dataDir = resolve(cwd, '.data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  const dbPath = resolve(dataDir, 'app.db')
  console.log(`[migrate] Database: ${dbPath}`)

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite)

  await runMigrations(migrate, db, sqlite, { migrationsFolder })
}
