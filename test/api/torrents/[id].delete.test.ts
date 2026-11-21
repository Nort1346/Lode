import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetMediaImportMode } = vi.hoisted(() => ({ mockGetMediaImportMode: vi.fn() }))

const mockGetUserSession = vi.fn()
const mockGet = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockDeleteTorrent = vi.fn()
const mockLogActivity = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal(
  'getRouterParam',
  vi.fn((_event: unknown, key: string) => (key === 'id' ? 'dl-1' : undefined))
)
vi.stubGlobal('logActivity', mockLogActivity)
vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get: mockGet }))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ get: vi.fn(), run: mockRun }))
      }))
    }))
  }))
)
vi.stubGlobal(
  'useQBittorrent',
  vi.fn(() => ({
    deleteTorrent: mockDeleteTorrent
  }))
)

vi.mock('#server/utils/library/media-settings', () => ({
  getMediaImportMode: mockGetMediaImportMode
}))

vi.mock('#server/database/schema', () => ({
  downloads: { id: 'id', userId: 'userId', torrentHash: 'torrentHash', torrentName: 'torrentName', status: 'status' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

import handler from '#server/api/torrents/[id].delete'

function download(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dl-1',
    userId: 'u1',
    torrentHash: 'abc123',
    torrentName: 'Movie',
    status: 'completed',
    organizeStatus: 'pending',
    ...overrides
  }
}

describe('torrents/[id].delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    mockGetMediaImportMode.mockResolvedValue('hardlink')
  })

  const mockEvent = {} as never

  it('deletes torrent and files from qBittorrent', async () => {
    mockGet.mockReturnValue(download())
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockDeleteTorrent).toHaveBeenCalledWith('abc123', true)
  })

  it('deletes the staging leftovers in move mode after the import moved the files out', async () => {
    mockGetMediaImportMode.mockResolvedValue('move')
    mockGet.mockReturnValue(download({ organizeStatus: 'done', organizedPath: '/library/Movies/Movie (2021)' }))
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockDeleteTorrent).toHaveBeenCalledWith('abc123', true)
  })

  it('deletes the partial staging files of an incomplete download in move mode', async () => {
    mockGetMediaImportMode.mockResolvedValue('move')
    mockGet.mockReturnValue(download({ status: 'downloading' }))
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockDeleteTorrent).toHaveBeenCalledWith('abc123', true)
  })

  it('keeps the staging files of a completed download whose move import has not run yet', async () => {
    mockGetMediaImportMode.mockResolvedValue('move')
    mockGet.mockReturnValue(download({ organizeStatus: 'pending' }))
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockDeleteTorrent).toHaveBeenCalledWith('abc123', false)
  })

  it('keeps the staging files when the move import failed', async () => {
    mockGetMediaImportMode.mockResolvedValue('move')
    mockGet.mockReturnValue(download({ organizeStatus: 'failed' }))
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockDeleteTorrent).toHaveBeenCalledWith('abc123', false)
  })

  it('removes the staging copy in hardlink mode', async () => {
    mockGetMediaImportMode.mockResolvedValue('hardlink')
    mockGet.mockReturnValue(download({ organizedPath: '/library/Movies/Movie (2021)' }))
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockDeleteTorrent).toHaveBeenCalledWith('abc123', true)
  })

  it('removes the staging copy in copy mode', async () => {
    mockGetMediaImportMode.mockResolvedValue('copy')
    mockGet.mockReturnValue(download({ organizedPath: '/library/Movies/Movie (2021)' }))
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockDeleteTorrent).toHaveBeenCalledWith('abc123', true)
  })

  it('keeps the files when the import mode setting cannot be read', async () => {
    mockGetMediaImportMode.mockRejectedValue(new Error('db down'))
    mockGet.mockReturnValue(download())
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockDeleteTorrent).toHaveBeenCalledWith('abc123', false)
  })

  it('deletes the files for an unknown import mode, which normalizes to hardlink', async () => {
    mockGetMediaImportMode.mockResolvedValue('hardlink')
    mockGet.mockReturnValue(download())
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockDeleteTorrent).toHaveBeenCalledWith('abc123', true)
  })

  it('sets status to removed (soft delete)', async () => {
    mockGet.mockReturnValue(download())
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockRun).toHaveBeenCalled()
  })

  it('handles qBittorrent offline gracefully', async () => {
    mockGet.mockReturnValue(download())
    mockDeleteTorrent.mockRejectedValue(new Error('Connection refused'))

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockRun).toHaveBeenCalled()
  })

  it('logs activity with the delete-files decision', async () => {
    mockGetMediaImportMode.mockResolvedValue('move')
    mockGet.mockReturnValue(download({ organizeStatus: 'done', organizedPath: '/library/Movies/Movie (2021)' }))
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockLogActivity).toHaveBeenCalledWith(mockEvent, {
      action: 'torrent_delete',
      userId: 'u1',
      username: 'user1',
      details: JSON.stringify({ name: 'Movie', hash: 'abc123', deleteFiles: true })
    })
  })

  it('throws 403 for unauthorized user', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'other', role: 'user', username: 'other' } })
    mockGet.mockReturnValue(download())

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })

  it('allows admin to delete other user download', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin', username: 'admin' } })
    mockGet.mockReturnValue(download())
    mockDeleteTorrent.mockResolvedValue(undefined)

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
  })
})
