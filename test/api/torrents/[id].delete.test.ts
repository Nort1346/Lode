import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGet = vi.fn()
const mockRun = vi.fn()
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
        where: vi.fn(() => ({ run: mockRun }))
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

vi.mock('#server/database/schema', () => ({
  downloads: { id: 'id', userId: 'userId', torrentHash: 'torrentHash', torrentName: 'torrentName', status: 'status' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

import handler from '#server/api/torrents/[id].delete'

describe('torrents/[id].delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('deletes torrent and files from qBittorrent', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', torrentName: 'Movie' })
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockDeleteTorrent).toHaveBeenCalledWith('abc123', true)
  })

  it('sets status to removed (soft delete)', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', torrentName: 'Movie' })
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockRun).toHaveBeenCalled()
  })

  it('handles qBittorrent offline gracefully', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', torrentName: 'Movie' })
    mockDeleteTorrent.mockRejectedValue(new Error('Connection refused'))

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockRun).toHaveBeenCalled()
  })

  it('logs activity', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', torrentName: 'Movie' })
    mockDeleteTorrent.mockResolvedValue(undefined)

    await handler(mockEvent)
    expect(mockLogActivity).toHaveBeenCalledWith(mockEvent, {
      action: 'torrent_delete',
      userId: 'u1',
      username: 'user1',
      details: JSON.stringify({ name: 'Movie', hash: 'abc123' })
    })
  })

  it('throws 403 for unauthorized user', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'other', role: 'user', username: 'other' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', torrentName: 'Movie' })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })

  it('allows admin to delete other user download', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin', username: 'admin' } })
    mockGet.mockReturnValue({ id: 'dl-1', userId: 'u1', torrentHash: 'abc123', torrentName: 'Movie' })
    mockDeleteTorrent.mockResolvedValue(undefined)

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
  })
})
