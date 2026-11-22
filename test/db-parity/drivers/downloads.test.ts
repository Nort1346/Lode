import { afterAll, describe, expect, it } from 'vitest'
import { dbRun } from '#server/utils/db'
import { downloads } from '#server/database/schema'
import { createDownloadRepo } from '#server/repositories/downloads'
import type { CreateDownloadInput } from '#server/types/entities'
import type { DownloadRepo } from '#server/types/repos'
import { canRunForDriver, createFixture, type Fixture } from '../fixtures'

let fixturePromise: Promise<Fixture> | undefined

function getFixture(): Promise<Fixture> {
  fixturePromise ??= createFixture('lode_parity_downloads')
  return fixturePromise
}

function repo(fx: Fixture): DownloadRepo {
  return createDownloadRepo(fx.db)
}

// create() takes a full object in this codebase - build one, then override
function downloadInput(overrides: Partial<CreateDownloadInput> = {}): CreateDownloadInput {
  return {
    id: 'dl-x',
    userId: 'u-x',
    label: '',
    torrentName: '',
    magnetLink: 'magnet:?xt=urn:btih:test',
    savePath: 'movies',
    torrentHash: null,
    sizeBytes: 0,
    createdAt: '2026-11-22T00:00:00.000Z',
    tmdbId: null,
    mediaType: null,
    posterUrl: null,
    isPrivate: false,
    organizedPath: null,
    organizeStatus: 'pending',
    organizeError: null,
    ...overrides
  }
}

afterAll(async () => {
  if (fixturePromise !== undefined) {
    await (await fixturePromise).close()
  }
})

// The same assertions run on SQLite and on PostgreSQL (see vitest.db-parity.config.ts).
describe.runIf(canRunForDriver())('downloads repo parity', () => {
  it('round-trips booleans, large integers and floats', async () => {
    const fx = await getFixture()
    const r = repo(fx)
    await r.create(
      downloadInput({
        id: 'dl-rt',
        userId: 'u-rt',
        magnetLink: 'magnet:?xt=urn:btih:parity',
        sizeBytes: 1_234_567_890_123,
        isPrivate: true,
        tmdbId: 550,
        mediaType: 'movie'
      })
    )
    await r.update('dl-rt', { progress: 0.25, downloadedBytes: 987_654_321, etaSeconds: 3600, status: 'downloading' })

    const row = await r.findById('dl-rt')
    expect(row).toBeDefined()
    expect(row?.isPrivate).toBe(true)
    // progress is REAL: float64 on SQLite, float4 on PostgreSQL - compare with tolerance
    expect(row?.progress).toBeCloseTo(0.25, 5)
    // size_bytes is a 64-bit integer on both sides (INTEGER / bigint mode number)
    expect(row?.sizeBytes).toBe(1_234_567_890_123)
    expect(row?.downloadedBytes).toBe(987_654_321)
    expect(row?.etaSeconds).toBe(3600)
    expect(row?.tmdbId).toBe(550)
  })

  it('applies schema defaults on insert', async () => {
    const fx = await getFixture()
    const r = repo(fx)
    await r.create(downloadInput({ id: 'dl-def', userId: 'u-def', savePath: 'series' }))

    const row = await r.findById('dl-def')
    expect(row?.label).toBe('')
    expect(row?.torrentName).toBe('')
    expect(row?.status).toBe('pending')
    expect(row?.progress).toBe(0)
    expect(row?.isPrivate).toBe(false)
    expect(row?.organizeStatus).toBe('pending')
    expect(row?.numSeeds).toBe(0)
  })

  it('compares ISO-8601 text timestamps with gte (daily limit window)', async () => {
    const fx = await getFixture()
    const r = repo(fx)
    const since = '2026-11-22T00:00:00.000Z'

    await r.create(downloadInput({ id: 'dl-win-a', userId: 'u-win', createdAt: '2026-11-22T01:00:00.000Z' }))
    await r.create(downloadInput({ id: 'dl-win-b', userId: 'u-win', createdAt: '2026-11-22T02:00:00.000Z' }))
    await r.create(downloadInput({ id: 'dl-win-old', userId: 'u-win', createdAt: '2026-11-21T23:59:59.999Z' }))
    await r.update('dl-win-b', { status: 'completed' })

    // the pre-cutoff row is excluded by the gte() text comparison
    expect(typeof (await r.countByUserSince('u-win', since, []))).toBe('number')
    expect(await r.countByUserSince('u-win', since, [])).toBe(2)
    expect(await r.countByUserSince('u-win', since, ['completed'])).toBe(1)
  })

  it('orders by created_at text with DESC (per-user history hot path)', async () => {
    const fx = await getFixture()
    const r = repo(fx)
    const rowsIn = [
      { id: 'dl-o1', createdAt: '2026-11-22T10:00:00.000Z' },
      { id: 'dl-o2', createdAt: '2026-11-22T09:59:59.999Z' },
      { id: 'dl-o3', createdAt: '2026-11-22T10:00:01.000Z' }
    ]
    for (const row of rowsIn) {
      await r.create(downloadInput({ id: row.id, userId: 'u-order', createdAt: row.createdAt }))
    }

    const rows = await r.findPaginated({ userId: 'u-order' }, 1, 10)
    expect(rows.map((row) => row.id)).toEqual(['dl-o3', 'dl-o1', 'dl-o2'])
  })

  it('stats() counts active/created/completed identically', async () => {
    const fx = await getFixture()
    const r = repo(fx)
    const since = '2026-11-22T00:00:00.000Z'

    await r.create(downloadInput({ id: 'dl-s1', userId: 'u-stats', createdAt: '2026-11-22T08:00:00.000Z' }))
    await r.create(downloadInput({ id: 'dl-s2', userId: 'u-stats', createdAt: '2026-11-22T09:00:00.000Z' }))
    await r.create(downloadInput({ id: 'dl-s3', userId: 'u-stats', createdAt: '2026-11-19T09:00:00.000Z' }))
    await r.update('dl-s1', { status: 'downloading' })
    await r.update('dl-s2', { status: 'completed', completedAt: '2026-11-22T10:00:00.000Z' })
    await r.update('dl-s3', { status: 'completed', completedAt: '2026-11-19T10:00:00.000Z' })

    expect(await r.stats({ userId: 'u-stats' }, since)).toEqual({ active: 1, createdSince: 2, completedSince: 1 })
  })

  it('dbRun reports affected rows the same way on both drivers', async () => {
    const fx = await getFixture()
    const result = await dbRun(fx.db.insert(downloads).values(downloadInput({ id: 'dl-changes', userId: 'u-changes' })))
    expect(result.changes).toBe(1)
  })
})
