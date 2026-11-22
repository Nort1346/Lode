import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Row {
  id: string
  torrentHash: string | null
  organizeStatus: string
}

const mockRows = vi.hoisted(() => vi.fn((): Row[] => []))
const mockGetAllTorrents = vi.hoisted(() => vi.fn())
const mockDeleteTorrent = vi.hoisted(() => vi.fn())
const mockLog = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))

// test/setup.ts maps useDbAsync onto the global useDb, so a global stub is
// enough to feed rows through the real dbAll helper.
vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ all: () => mockRows() }))
      }))
    }))
  }))
)

vi.mock('#server/database/schema', () => ({
  downloads: { id: 'id', status: 'status', organizeStatus: 'organizeStatus', torrentHash: 'torrentHash' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, value: unknown) => ({ key: value })),
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions }))
}))

vi.stubGlobal(
  'useQBittorrent',
  vi.fn(() => ({ getAllTorrents: mockGetAllTorrents, deleteTorrent: mockDeleteTorrent }))
)

vi.mock('#server/utils/logger', () => ({ createLogger: vi.fn(() => mockLog) }))

import { removeOrganizedMissingFileTorrents } from '#server/utils/torrents/missing-files'

function torrent(hash: string, state: string) {
  return {
    hash,
    name: hash,
    progress: 1,
    eta: 0,
    dlspeed: 0,
    dlspeed_avg: 0,
    upspeed: 0,
    size: 100,
    amount_left: 0,
    downloaded: 100,
    num_seeds: 0,
    num_complete: 0,
    num_leechs: 0,
    state,
    save_path: '/staging',
    category: 'movies',
    tags: '',
    added_on: 0,
    completion_on: 1
  }
}

function row(id: string, torrentHash: string | null): Row {
  return { id, torrentHash, organizeStatus: 'done' }
}

describe('removeOrganizedMissingFileTorrents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRows.mockReturnValue([])
    mockGetAllTorrents.mockReset()
    mockGetAllTorrents.mockResolvedValue([])
    mockDeleteTorrent.mockReset()
    mockDeleteTorrent.mockResolvedValue(undefined)
  })

  it('does not query qBittorrent when there are no organized downloads', async () => {
    await expect(removeOrganizedMissingFileTorrents()).resolves.toBe(0)

    expect(mockGetAllTorrents).not.toHaveBeenCalled()
  })

  it('removes organized torrents in the missingFiles state without deleting their files', async () => {
    mockRows.mockReturnValue([row('dl-1', 'h1'), row('dl-2', 'h2')])
    mockGetAllTorrents.mockResolvedValue([torrent('h1', 'missingFiles'), torrent('h2', 'uploading')])

    await expect(removeOrganizedMissingFileTorrents()).resolves.toBe(1)

    expect(mockDeleteTorrent).toHaveBeenCalledTimes(1)
    expect(mockDeleteTorrent).toHaveBeenCalledWith('h1', false)
  })

  it('skips rows without a torrent hash', async () => {
    mockRows.mockReturnValue([row('dl-1', null), row('dl-2', 'h2')])
    mockGetAllTorrents.mockResolvedValue([torrent('h2', 'missingFiles')])

    await expect(removeOrganizedMissingFileTorrents()).resolves.toBe(1)

    expect(mockDeleteTorrent).toHaveBeenCalledWith('h2', false)
  })

  it('keeps sweeping after one removal fails', async () => {
    mockRows.mockReturnValue([row('dl-1', 'h1'), row('dl-2', 'h2')])
    mockGetAllTorrents.mockResolvedValue([torrent('h1', 'missingFiles'), torrent('h2', 'missingFiles')])
    mockDeleteTorrent.mockRejectedValueOnce(new Error('qBittorrent API error 500: boom'))

    await expect(removeOrganizedMissingFileTorrents()).resolves.toBe(1)

    expect(mockDeleteTorrent).toHaveBeenNthCalledWith(1, 'h1', false)
    expect(mockDeleteTorrent).toHaveBeenNthCalledWith(2, 'h2', false)
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('failed to remove missing-files torrent'))
  })

  it('swallows qBittorrent fetch failures', async () => {
    mockRows.mockReturnValue([row('dl-1', 'h1')])
    mockGetAllTorrents.mockRejectedValue(new Error('qBittorrent offline'))

    await expect(removeOrganizedMissingFileTorrents()).resolves.toBe(0)

    expect(mockDeleteTorrent).not.toHaveBeenCalled()
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('missing-files sweep failed'))
  })
})
