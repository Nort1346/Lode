#!/usr/bin/env node

import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

const cwd = process.cwd()
const driver = process.env.DB_DRIVER ?? 'sqlite'

// In dev: root node_modules/ exists → use it
// In Docker: only .output/server/node_modules/ exists → use it
const hasRootModules = existsSync(resolve(cwd, 'node_modules'))
const modulesBase = hasRootModules ? cwd : resolve(cwd, '.output/server')

const require = createRequire(resolve(modulesBase, 'package.json'))

const migrationsFolder = resolve(cwd, 'server/database/migrations')

if (!existsSync(migrationsFolder)) {
  console.error(`[migrate] Migrations folder not found: ${migrationsFolder}`)
  process.exit(1)
}

console.log(`[migrate] Driver: ${driver}`)
console.log(`[migrate] Migrations: ${migrationsFolder}`)

if (driver === 'postgres') {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString || connectionString === '') {
    console.error('[migrate] DATABASE_URL is required for PostgreSQL.')
    process.exit(1)
  }

  const postgres = require('postgres')
  const { drizzle } = require('drizzle-orm/postgres-js')
  const { migrate } = require('drizzle-orm/postgres-js/migrator')

  const client = postgres(connectionString)
  const db = drizzle(client)

  try {
    await migrate(db, { migrationsFolder })
    console.log('[migrate] Done.')
  } catch (err) {
    console.error('[migrate] Migration failed:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
} else {
  const Database = require('better-sqlite3')
  const { drizzle } = require('drizzle-orm/better-sqlite3')
  const { migrate } = require('drizzle-orm/better-sqlite3/migrator')

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

  try {
    migrate(db, { migrationsFolder })
    console.log('[migrate] Done.')
  } catch (err) {
    console.error('[migrate] Migration failed:', err)
    process.exit(1)
  } finally {
    sqlite.close()
  }
}
