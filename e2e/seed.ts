// Seeds the E2E database with known users so the browser tests can drive
// real login flows. Run AFTER scripts/migrate.mjs against the same
// DB_DATA_DIR (E2E always passes .data-e2e).

import { randomUUID } from 'node:crypto'
import { resolve, join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import Database from 'better-sqlite3'
import { hash } from '@node-rs/bcrypt'
import { E2E_USERS } from './credentials.ts'

const dataDir = resolve(process.cwd(), process.env.DB_DATA_DIR || '.data')
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })

const dbPath = join(dataDir, 'app.db')
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const insert = db.prepare(`
  INSERT INTO users (
    id, username, password, role, is_active, daily_download_limit, active_torrent_limit,
    max_torrent_size_gb, private_tracker_limit, downloads_today, created_at,
    can_submit, must_change_password, max_sessions, sync_status
  ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 5, 0, ?, 0, 0, 0, 'pending')
`)

const now = new Date().toISOString()
for (const user of E2E_USERS) {
  const hashed = await hash(user.password, { cost: 12 })
  insert.run(
    randomUUID(),
    user.username,
    hashed,
    user.role,
    user.dailyDownloadLimit,
    user.activeTorrentLimit,
    user.maxTorrentSizeGb,
    now
  )
}

db.close()
console.log(`[seed] seeded ${E2E_USERS.length} users into ${dbPath}`)
