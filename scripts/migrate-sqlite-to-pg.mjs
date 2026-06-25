#!/usr/bin/env node

/**
 * Migrate data from SQLite to PostgreSQL.
 *
 * Usage:
 *   node scripts/migrate-sqlite-to-pg.mjs            # migrate all tables
 *   node scripts/migrate-sqlite-to-pg.mjs --dry-run  # preview without writing
 *   node scripts/migrate-sqlite-to-pg.mjs --force     # overwrite existing PG data
 *
 * Requires:
 *   DB_DRIVER=postgres
 *   DATABASE_URL=postgresql://...
 *   SQLite file at .data/app.db
 */

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'

const cwd = process.cwd()
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')

const driver = process.env.DB_DRIVER ?? 'sqlite'
if (driver !== 'postgres') {
  console.error('[migrate-pg] DB_DRIVER must be "postgres" for this script.')
  process.exit(1)
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('[migrate-pg] DATABASE_URL is required.')
  process.exit(1)
}

const sqlitePath = resolve(cwd, '.data/app.db')
if (!existsSync(sqlitePath)) {
  console.error(`[migrate-pg] SQLite file not found: ${sqlitePath}`)
  process.exit(1)
}

// ── Resolve modules ────────────────────────────────────────
const rootModules = resolve(cwd, 'node_modules')
const outputModules = resolve(cwd, '.output/server/node_modules')
const modulesPath = process.env.MODULES_PATH ?? (existsSync(rootModules) ? rootModules : outputModules)

console.log(`[migrate-pg] Modules: ${modulesPath}`)

const u = (pkg) => pathToFileURL(resolve(modulesPath, pkg)).href

const { default: Database } = await import(u('better-sqlite3/lib/index.js'))
const { default: postgres } = await import(u('postgres'))

// ── PostgreSQL schema DDL ──────────────────────────────────
// Matches server/database/schema.ts — generated for PostgreSQL dialect
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY NOT NULL,
  "username" text NOT NULL,
  "password" text NOT NULL,
  "role" text DEFAULT 'user' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "daily_download_limit" integer DEFAULT 5 NOT NULL,
  "active_torrent_limit" integer DEFAULT 3 NOT NULL,
  "max_torrent_size_gb" integer DEFAULT 20 NOT NULL,
  "private_tracker_limit" integer DEFAULT 5 NOT NULL,
  "downloads_today" integer DEFAULT 0 NOT NULL,
  "downloads_reset_at" text,
  "created_at" text DEFAULT '' NOT NULL,
  "discord_id" text,
  "can_submit" boolean DEFAULT false NOT NULL,
  "max_sessions" integer DEFAULT 0 NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique" ON "users" ("username");

CREATE TABLE IF NOT EXISTS "downloads" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "label" text DEFAULT '' NOT NULL,
  "torrent_name" text DEFAULT '' NOT NULL,
  "magnet_link" text NOT NULL,
  "save_path" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "torrent_hash" text,
  "progress" real DEFAULT 0 NOT NULL,
  "eta_seconds" integer DEFAULT 0 NOT NULL,
  "download_speed" integer DEFAULT 0 NOT NULL,
  "upload_speed" integer DEFAULT 0 NOT NULL,
  "size_bytes" integer DEFAULT 0 NOT NULL,
  "downloaded_bytes" integer DEFAULT 0 NOT NULL,
  "num_seeds" integer DEFAULT 0 NOT NULL,
  "num_leechs" integer DEFAULT 0 NOT NULL,
  "created_at" text DEFAULT '' NOT NULL,
  "completed_at" text,
  "tmdb_id" integer,
  "media_type" text,
  "poster_url" text,
  "is_private" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "activity_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "username" text,
  "action" text NOT NULL,
  "details" text,
  "ip" text,
  "user_agent" text,
  "created_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "requests" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "username" text NOT NULL,
  "media_type" text NOT NULL,
  "media_id" integer NOT NULL,
  "media_title" text NOT NULL,
  "media_poster" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "user_note" text,
  "admin_note" text,
  "created_at" text NOT NULL,
  "updated_at" text
);

CREATE TABLE IF NOT EXISTS "custom_trackers" (
  "id" text PRIMARY KEY NOT NULL,
  "indexer_name" text NOT NULL,
  "tracker_type" text DEFAULT 'counting' NOT NULL,
  "cookie" text DEFAULT '' NOT NULL,
  "login_url" text,
  "login_username" text,
  "login_password" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" text DEFAULT '' NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_custom_trackers_indexer" ON "custom_trackers" ("indexer_name");

CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" text PRIMARY KEY NOT NULL,
  "ip" text NOT NULL,
  "username" text,
  "success" boolean DEFAULT false NOT NULL,
  "user_agent" text,
  "created_at" text DEFAULT '' NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_login_attempts_ip" ON "login_attempts" ("ip", "created_at");
CREATE INDEX IF NOT EXISTS "idx_login_attempts_username" ON "login_attempts" ("username", "created_at");
CREATE INDEX IF NOT EXISTS "idx_login_attempts_created" ON "login_attempts" ("created_at");

CREATE TABLE IF NOT EXISTS "wishlist" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "media_type" text NOT NULL,
  "media_id" integer NOT NULL,
  "media_title" text NOT NULL,
  "media_poster" text,
  "created_at" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_wishlist_user_media" ON "wishlist" ("user_id", "media_type", "media_id");

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "ip" text,
  "user_agent" text,
  "device_name" text,
  "created_at" text NOT NULL,
  "last_active_at" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_sessions_user" ON "sessions" ("user_id");

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "link" text,
  "data" text,
  "read" boolean DEFAULT false NOT NULL,
  "created_at" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_notifications_user" ON "notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_notifications_user_read" ON "notifications" ("user_id", "read");

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" text NOT NULL,
  "last_used_at" text
);

CREATE INDEX IF NOT EXISTS "idx_push_subscriptions_user" ON "push_subscriptions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_push_subscriptions_endpoint" ON "push_subscriptions" ("endpoint");
`

// ── Table definitions (for data migration) ─────────────────
const TABLES = [
  { name: 'users', booleanColumns: ['is_active', 'can_submit'] },
  { name: 'downloads', booleanColumns: ['is_private'] },
  { name: 'settings', booleanColumns: [] },
  { name: 'activity_logs', booleanColumns: [] },
  { name: 'requests', booleanColumns: [] },
  { name: 'custom_trackers', booleanColumns: ['enabled'] },
  { name: 'login_attempts', booleanColumns: ['success'] },
  { name: 'wishlist', booleanColumns: [] },
  { name: 'sessions', booleanColumns: [] },
  { name: 'notifications', booleanColumns: ['read'] },
  { name: 'push_subscriptions', booleanColumns: [] }
]

// ── Helpers ────────────────────────────────────────────────
function transformRow(row, booleanColumns) {
  const out = {}
  for (const [key, val] of Object.entries(row)) {
    if (booleanColumns.includes(key)) {
      out[key] = val === 1 || val === '1' || val === true
    } else {
      out[key] = val
    }
  }
  return out
}

function chunk(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  console.log(`[migrate-pg] Dry run: ${dryRun}`)
  console.log(`[migrate-pg] Force: ${force}`)
  console.log(`[migrate-pg] SQLite: ${sqlitePath}`)
  console.log(`[migrate-pg] PostgreSQL: ${connectionString.replace(/\/\/.*@/, '//***:***@')}`)
  console.log()

  // Open SQLite
  const sqlite = new Database(sqlitePath)
  sqlite.pragma('journal_mode = WAL')

  // Count rows per table in SQLite
  const counts = {}
  for (const table of TABLES) {
    const row = sqlite.prepare(`SELECT COUNT(*) as cnt FROM "${table.name}"`).get()
    counts[table.name] = row.cnt
  }

  console.log('[migrate-pg] SQLite row counts:')
  for (const table of TABLES) {
    console.log(`  ${table.name}: ${counts[table.name]}`)
  }
  console.log()

  if (dryRun) {
    console.log('[migrate-pg] Dry run — no changes made.')
    sqlite.close()
    return
  }

  // Connect to PostgreSQL
  const client = postgres(connectionString)

  // Create schema (idempotent — uses IF NOT EXISTS)
  console.log('[migrate-pg] Creating PostgreSQL schema...')
  const statements = SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const stmt of statements) {
    await client.unsafe(stmt)
  }
  console.log('[migrate-pg] Schema created.')
  console.log()

  // Check if PG already has data
  if (!force) {
    for (const table of TABLES) {
      const result = await client.unsafe(`SELECT COUNT(*) as cnt FROM "${table.name}"`)
      const pgCount = Number(result[0].cnt)
      if (pgCount > 0) {
        console.error(`[migrate-pg] Table "${table.name}" already has ${pgCount} rows. Use --force to overwrite.`)
        await client.end()
        sqlite.close()
        process.exit(1)
      }
    }
  }

  // Migrate data
  console.log('[migrate-pg] Migrating data...')
  let totalInserted = 0
  let totalExpected = 0

  for (const table of TABLES) {
    const rows = sqlite.prepare(`SELECT * FROM "${table.name}"`).all()
    if (rows.length === 0) {
      console.log(`  ${table.name}: 0 rows (skipped)`)
      continue
    }

    totalExpected += rows.length
    const transformed = rows.map((row) => transformRow(row, table.booleanColumns))
    const columns = Object.keys(transformed[0])
    const batches = chunk(transformed, 500)
    let inserted = 0

    for (const batch of batches) {
      const values = []
      const params = []
      let paramIdx = 1

      for (const row of batch) {
        const rowValues = []
        for (const col of columns) {
          rowValues.push(`$${paramIdx}`)
          params.push(row[col] ?? null)
          paramIdx++
        }
        values.push(`(${rowValues.join(', ')})`)
      }

      const sql = `INSERT INTO "${table.name}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${values.join(', ')}`
      await client.unsafe(sql, params)
      inserted += batch.length
    }

    totalInserted += inserted
    console.log(`  ${table.name}: ${inserted}/${rows.length} rows`)
  }

  console.log()
  console.log(`[migrate-pg] Done. ${totalInserted}/${totalExpected} total rows migrated.`)

  // Verify counts
  console.log()
  console.log('[migrate-pg] Verifying PostgreSQL row counts...')
  let allMatch = true
  for (const table of TABLES) {
    const result = await client.unsafe(`SELECT COUNT(*) as cnt FROM "${table.name}"`)
    const pgCount = Number(result[0].cnt)
    const match = pgCount === counts[table.name]
    const icon = match ? '✓' : '✗'
    console.log(`  ${icon} ${table.name}: ${pgCount} (expected ${counts[table.name]})`)
    if (!match) allMatch = false
  }

  console.log()
  if (allMatch) {
    console.log('[migrate-pg] All tables verified. Migration successful!')
  } else {
    console.error('[migrate-pg] Row count mismatch! Check the logs above.')
  }

  await client.end()
  sqlite.close()
}

main().catch((err) => {
  console.error('[migrate-pg] Fatal error:', err)
  process.exit(1)
})
