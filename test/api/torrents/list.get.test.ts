import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockAll = vi.fn()
const _mockGet = vi.fn()
const mockCountGet = vi.fn()
const mockAllUsers = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal(
  'getQuery',
  vi.fn(() => ({}))
)
vi.stubGlobal(
  'useDb',
  vi.fn(() => {
    let callIndex = 0
    return {
      select: vi.fn((...args: unknown[]) => {
        const hasCount =
          args.length > 0 &&
          args[0] !== undefined &&
          typeof args[0] === 'object' &&
          'count' in (args[0] as Record<string, unknown>)
        if (hasCount) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                get: mockCountGet
              }))
            }))
          }
        }
        callIndex++
        if (callIndex > 1) {
          return {
            from: vi.fn(() => ({
              all: mockAllUsers
            }))
          }
        }
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => ({
                  offset: vi.fn(() => ({
                    all: mockAll
                  }))
                }))
              }))
            }))
          }))
        }
      })
    }
  })
)

const mockSyncTorrentStatus = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const mockNotifyJellyfinIfNeeded = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('#server/utils/torrent-sync', () => ({
  syncTorrentStatus: mockSyncTorrentStatus,
  notifyJellyfinIfNeeded: mockNotifyJellyfinIfNeeded
}))

vi.mock('#server/database/schema', () => ({
  downloads: { id: 'id', userId: 'userId', status: 'status', createdAt: 'createdAt' },
  users: { id: 'id', username: 'username' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  count: vi.fn(() => 'count')
}))

import handler from '#server/api/torrents/list.get'
import { getQuery } from 'h3'

describe('torrents/list.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('returns paginated downloads', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(getQuery).mockReturnValue({})
    mockCountGet.mockReturnValue({ count: 2 })
    mockAll.mockReturnValue([
      { id: 'dl-1', userId: 'u1', status: 'downloading' },
      { id: 'dl-2', userId: 'u1', status: 'completed' }
    ])

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        downloads: expect.arrayContaining([
          expect.objectContaining({ id: 'dl-1' }),
          expect.objectContaining({ id: 'dl-2' })
        ]),
        total: 2,
        page: 1
      })
    )
    expect(mockSyncTorrentStatus).toHaveBeenCalled()
  })

  it('calls notifyJellyfinIfNeeded', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(getQuery).mockReturnValue({})
    mockCountGet.mockReturnValue({ count: 0 })
    mockAll.mockReturnValue([])

    await handler(mockEvent)
    expect(mockNotifyJellyfinIfNeeded).toHaveBeenCalled()
  })

  it('enriches with usernames for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin', username: 'admin' } })
    vi.mocked(getQuery).mockReturnValue({})
    mockCountGet.mockReturnValue({ count: 1 })
    mockAll.mockReturnValue([{ id: 'dl-1', userId: 'u1', status: 'downloading' }])
    mockAllUsers.mockReturnValue([{ id: 'u1', username: 'user1' }])

    const result = (await handler(mockEvent)) as { downloads: Array<{ id: string; username?: string }> }
    expect(result.downloads[0]).toEqual(expect.objectContaining({ username: 'user1' }))
  })

  it('non-admin sees only own downloads', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })
    vi.mocked(getQuery).mockReturnValue({})
    mockCountGet.mockReturnValue({ count: 1 })
    mockAll.mockReturnValue([{ id: 'dl-1', userId: 'u1', status: 'downloading' }])

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        downloads: [expect.objectContaining({ userId: 'u1' })]
      })
    )
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
