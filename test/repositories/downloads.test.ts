import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { downloads } from '#server/database/schema'
import { createDownloadRepo } from '#server/repositories/downloads'
import type { SqliteDb } from '#server/types/database'

// Mirrors server/database/schema.sqlite.ts so drizzle inserts and stats queries run against real SQL
function createDb(): SqliteDb {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE downloads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      torrent_name TEXT NOT NULL DEFAULT '',
      magnet_link TEXT NOT NULL,
      save_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      torrent_hash TEXT,
      progress REAL NOT NULL DEFAULT 0,
      eta_seconds INTEGER NOT NULL DEFAULT 0,
      download_speed INTEGER NOT NULL DEFAULT 0,
      upload_speed INTEGER NOT NULL DEFAULT 0,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      downloaded_bytes INTEGER NOT NULL DEFAULT 0,
      num_seeds INTEGER NOT NULL DEFAULT 0,
      num_leechs INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      notified_at TEXT,
      tmdb_id INTEGER,
      media_type TEXT,
      poster_url TEXT,
      is_private INTEGER NOT NULL DEFAULT 0
    )
  `)
  return drizzle(sqlite)
}

function todayStartIso(): string {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return start.toISOString()
}

async function seedCompleted(db: SqliteDb, id: string, userId: string, completedAt: string): Promise<void> {
  await db.insert(downloads).values({
    id,
    userId,
    magnetLink: 'magnet:?xt=urn:btih:test',
    savePath: 'movies',
    status: 'completed',
    createdAt: completedAt,
    completedAt
  })
}

describe('downloads repo stats', () => {
  it('keeps counting a completed download after the prep countdown marks it notified', async () => {
    const db = createDb()
    const repo = createDownloadRepo(db)
    const sinceIso = todayStartIso()
    const now = new Date().toISOString()

    await seedCompleted(db, 'dl-1', 'u1', now)

    // download just finished - the completed-today stat increments
    expect((await repo.stats({ userId: 'u1' }, sinceIso)).completedSince).toBe(1)

    // prep countdown finishes: torrent-sync marks the download notified,
    // leaving completedAt untouched
    await db.update(downloads).set({ notifiedAt: new Date().toISOString() }).where(eq(downloads.id, 'dl-1'))

    // the stat must not decrease
    expect((await repo.stats({ userId: 'u1' }, sinceIso)).completedSince).toBe(1)
  })

  it('does not count downloads completed before the cutoff', async () => {
    const db = createDb()
    const repo = createDownloadRepo(db)
    const sinceIso = todayStartIso()
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

    await seedCompleted(db, 'dl-1', 'u1', threeDaysAgo)

    expect((await repo.stats({ userId: 'u1' }, sinceIso)).completedSince).toBe(0)
  })

  it('only counts completed downloads of the requesting user', async () => {
    const db = createDb()
    const repo = createDownloadRepo(db)
    const sinceIso = todayStartIso()
    const now = new Date().toISOString()

    await seedCompleted(db, 'dl-1', 'u1', now)
    await seedCompleted(db, 'dl-2', 'u2', now)

    expect((await repo.stats({ userId: 'u1' }, sinceIso)).completedSince).toBe(1)
    expect((await repo.stats({}, sinceIso)).completedSince).toBe(2)
  })
})
