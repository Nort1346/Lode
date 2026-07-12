import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGet = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get: mockGet }))
      }))
    }))
  }))
)

vi.mock('h3', () => ({
  defineEventHandler: (fn: unknown) => fn,
  createError: (opts: { statusCode: number; statusMessage: string }) => {
    throw new Error(`${opts.statusCode}: ${opts.statusMessage}`)
  }
}))

vi.mock('#server/database/schema', () => ({
  users: { id: 'id' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

import handler from '#server/api/user/me.get'

describe('user/me.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('returns user profile when authenticated', async () => {
    mockGetUserSession.mockResolvedValue({
      user: { id: 'u1' }
    })
    mockGet.mockReturnValue({
      id: 'u1',
      username: 'testuser',
      role: 'user',
      isActive: true,
      canSubmit: true,
      dailyDownloadLimit: 5,
      activeTorrentLimit: 3,
      maxTorrentSizeGb: 20,
      privateTrackerLimit: 5,
      downloadsToday: 0,
      avatarUrl: null
    })

    const result = await handler(mockEvent)
    expect(result).toEqual({
      id: 'u1',
      username: 'testuser',
      role: 'user',
      isActive: true,
      canSubmit: true,
      dailyDownloadLimit: 5,
      activeTorrentLimit: 3,
      maxTorrentSizeGb: 20,
      privateTrackerLimit: 5,
      downloadsToday: 0,
      avatarUrl: null
    })
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })

  it('throws 404 when user not found in DB', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGet.mockReturnValue(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('404: User not found')
  })
})
