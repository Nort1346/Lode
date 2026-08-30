import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetReposAsync, mockSyncTorrentStatus } = vi.hoisted(() => ({
  mockGetReposAsync: vi.fn(),
  mockSyncTorrentStatus: vi.fn()
}))

vi.mock('#server/repositories', () => ({
  getReposAsync: mockGetReposAsync
}))

vi.mock('#server/utils/torrents/torrent-sync', () => ({
  syncTorrentStatus: mockSyncTorrentStatus
}))

const mockGetUserSession = vi.fn()
vi.stubGlobal('getUserSession', mockGetUserSession)

import handler from '#server/api/torrents/stats.get'

describe('torrents/stats.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('getUserSession', mockGetUserSession)
    mockGetUserSession.mockReset()
    mockGetReposAsync.mockReset()
    mockSyncTorrentStatus.mockReset()
    mockSyncTorrentStatus.mockResolvedValue({ synced: 0, completed: 0, failed: 0 })
  })

  const mockEvent = {} as never
  const mockStats = { active: 1, createdSince: 2, completedSince: 3 }

  function setupRepos() {
    const statsFn = vi.fn(async () => mockStats)
    mockGetReposAsync.mockResolvedValue({
      downloads: { stats: statsFn }
    })
    return statsFn
  }

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: null })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })

  it('returns fleet-wide stats for admin', async () => {
    const statsFn = setupRepos()
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })

    const result = await handler(mockEvent)

    expect(result.sinceIso).toEqual(expect.any(String))
    expect(result).toMatchObject(mockStats)
    expect(statsFn).toHaveBeenCalledWith({}, result.sinceIso)
  })

  it('returns per-user stats for regular users', async () => {
    const statsFn = setupRepos()
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })

    const result = await handler(mockEvent)

    expect(result).toMatchObject(mockStats)
    expect(statsFn).toHaveBeenCalledWith({ userId: 'u1' }, result.sinceIso)
  })

  it('still returns stats when the sync step fails', async () => {
    setupRepos()
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    mockSyncTorrentStatus.mockRejectedValue(new Error('qbit offline'))

    const result = await handler(mockEvent)

    expect(result).toMatchObject(mockStats)
    expect(mockSyncTorrentStatus).toHaveBeenCalled()
  })

  it('computes sinceIso from the start of the current day', async () => {
    setupRepos()
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })

    const result = await handler(mockEvent)

    const since = new Date(result.sinceIso)
    const now = new Date()
    expect(since.getFullYear()).toBe(now.getFullYear())
    expect(since.getMonth()).toBe(now.getMonth())
    expect(since.getDate()).toBe(now.getDate())
  })
})
