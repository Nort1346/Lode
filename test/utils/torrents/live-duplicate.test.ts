import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}))

import { findLiveDuplicateByLink } from '#server/utils/torrents/live-duplicate'

function mockDb(allRows: unknown[] = []) {
  const run = vi.fn(() => ({ changes: 1 }))
  const where = vi.fn(() => ({ run }))
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => allRows),
          get: vi.fn(() => undefined)
        }))
      }))
    })),
    update
  } as never
  return { db, update }
}

describe('findLiveDuplicateByLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no rows match and never writes', async () => {
    const { db, update } = mockDb([])
    const qbit = { findTorrentByHash: vi.fn() }

    await expect(findLiveDuplicateByLink(db, qbit, 'u1', 'download:https://x/y')).resolves.toBeNull()
    expect(qbit.findTorrentByHash).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('returns null when the row hash is gone from qBittorrent and never writes', async () => {
    const { db, update } = mockDb([{ id: 'old-1', torrentHash: 'a'.repeat(40), status: 'completed' }])
    const qbit = { findTorrentByHash: vi.fn().mockResolvedValue(undefined) }

    await expect(findLiveDuplicateByLink(db, qbit, 'u1', 'download:https://x/y')).resolves.toBeNull()
    expect(qbit.findTorrentByHash).toHaveBeenCalledWith('a'.repeat(40))
    expect(update).not.toHaveBeenCalled()
  })

  it('reports a still-downloading torrent as not complete', async () => {
    const { db, update } = mockDb([{ id: 'old-1', torrentHash: 'a'.repeat(40), status: 'completed' }])
    const qbit = {
      findTorrentByHash: vi.fn().mockResolvedValue({ hash: 'a'.repeat(40), name: 'Live', state: 'downloading' })
    }

    await expect(findLiveDuplicateByLink(db, qbit, 'u1', 'download:https://x/y')).resolves.toEqual({
      complete: false,
      name: 'Live'
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('reports a seeding torrent as complete', async () => {
    const { db } = mockDb([{ id: 'old-1', torrentHash: 'a'.repeat(40), status: 'downloading' }])
    const qbit = {
      findTorrentByHash: vi.fn().mockResolvedValue({ hash: 'a'.repeat(40), name: 'Live', state: 'uploading' })
    }

    await expect(findLiveDuplicateByLink(db, qbit, 'u1', 'download:https://x/y')).resolves.toEqual({
      complete: true,
      name: 'Live'
    })
  })

  it('skips rows without a hash and keeps looking (fail-open per row)', async () => {
    const { db } = mockDb([
      { id: 'old-1', torrentHash: null, status: 'completed' },
      { id: 'old-2', torrentHash: 'b'.repeat(40), status: 'completed' }
    ])
    const qbit = {
      findTorrentByHash: vi.fn().mockResolvedValue({ hash: 'b'.repeat(40), name: 'Live', state: 'downloading' })
    }

    await expect(findLiveDuplicateByLink(db, qbit, 'u1', 'download:https://x/y')).resolves.toEqual({
      complete: false,
      name: 'Live'
    })
    expect(qbit.findTorrentByHash).toHaveBeenCalledTimes(1)
    expect(qbit.findTorrentByHash).toHaveBeenCalledWith('b'.repeat(40))
  })

  it('ignores lookup failures and keeps looking', async () => {
    const { db } = mockDb([
      { id: 'old-1', torrentHash: 'a'.repeat(40), status: 'completed' },
      { id: 'old-2', torrentHash: 'b'.repeat(40), status: 'completed' }
    ])
    const qbit = {
      findTorrentByHash: vi
        .fn()
        .mockRejectedValueOnce(new Error('qBittorrent API error 500: boom'))
        .mockResolvedValue({ hash: 'b'.repeat(40), name: 'Live', state: 'downloading' })
    }

    await expect(findLiveDuplicateByLink(db, qbit, 'u1', 'download:https://x/y')).resolves.toEqual({
      complete: false,
      name: 'Live'
    })
  })
})
