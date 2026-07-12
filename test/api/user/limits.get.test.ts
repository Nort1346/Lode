import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGet = vi.fn()
const mockAll = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get: mockGet, all: mockAll }))
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
  users: { id: 'id' },
  downloads: { userId: 'userId', createdAt: 'createdAt', isPrivate: 'isPrivate', status: 'status' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

import handler from '#server/api/user/limits.get'

describe('user/limits.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('returns limits with zero downloads today', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGet.mockReturnValue({
      privateTrackerLimit: 5,
      dailyDownloadLimit: 10
    })
    mockAll.mockReturnValue([])

    const result = await handler(mockEvent)
    expect(result).toEqual({
      todayPrivate: 0,
      privateLimit: 5,
      dailyUsed: 0,
      dailyLimit: 10
    })
  })

  it('counts private and active downloads today', async () => {
    vi.useFakeTimers()
    const now = new Date()
    vi.setSystemTime(now)

    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGet.mockReturnValue({
      privateTrackerLimit: 5,
      dailyDownloadLimit: 10
    })
    mockAll.mockReturnValue([
      { userId: 'u1', createdAt: now.toISOString(), isPrivate: true, status: 'completed' },
      { userId: 'u1', createdAt: now.toISOString(), isPrivate: false, status: 'completed' },
      { userId: 'u1', createdAt: now.toISOString(), isPrivate: true, status: 'failed' }
    ])

    const result = await handler(mockEvent)
    expect(result.todayPrivate).toBe(2)
    expect(result.dailyUsed).toBe(2)
    expect(result.privateLimit).toBe(5)
    expect(result.dailyLimit).toBe(10)

    vi.useRealTimers()
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })

  it('throws 404 when user not in DB', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGet.mockReturnValue(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('404: User not found')
  })
})
