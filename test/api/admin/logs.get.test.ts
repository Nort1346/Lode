import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockCountGet = vi.fn()
const mockAll = vi.fn()
const mockGetQuery = vi.fn()

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  count: vi.fn(() => 'count')
}))

vi.mock('#server/database/schema', () => ({
  activityLogs: { action: 'action', userId: 'userId', createdAt: 'createdAt' }
}))

import handler from '#server/api/admin/logs.get'

describe('admin/logs.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('getQuery', mockGetQuery)
    mockGetQuery.mockReset()
    mockCountGet.mockReset()
    mockAll.mockReset()
  })

  const mockEvent = {} as never

  function stubDb() {
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
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
      }))
    )
  }

  it('returns paginated logs with defaults', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetQuery.mockReturnValue({})
    stubDb()
    mockCountGet.mockReturnValue({ count: 100 })
    mockAll.mockReturnValue([{ id: 'log1', action: 'login' }])

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        logs: [{ id: 'log1', action: 'login' }],
        page: 1,
        total: 100,
        totalPages: 2
      })
    )
  })

  it('returns empty logs', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetQuery.mockReturnValue({})
    stubDb()
    mockCountGet.mockReturnValue({ count: 0 })
    mockAll.mockReturnValue([])

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        logs: [],
        page: 1,
        total: 0,
        totalPages: 0
      })
    )
  })

  it('handles action filter', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetQuery.mockReturnValue({ action: 'login' })
    stubDb()
    mockCountGet.mockReturnValue({ count: 5 })
    mockAll.mockReturnValue([{ id: 'log1', action: 'login' }])

    const result = await handler(mockEvent)
    expect(result).toEqual(expect.objectContaining({ total: 5 }))
  })

  it('handles userId filter', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetQuery.mockReturnValue({ userId: 'u1' })
    stubDb()
    mockCountGet.mockReturnValue({ count: 3 })
    mockAll.mockReturnValue([])

    const result = await handler(mockEvent)
    expect(result).toEqual(expect.objectContaining({ total: 3 }))
  })

  it('handles custom page and limit', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetQuery.mockReturnValue({ page: '2', limit: '10' })
    stubDb()
    mockCountGet.mockReturnValue({ count: 50 })
    mockAll.mockReturnValue([])

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        page: 2,
        totalPages: 5,
        total: 50
      })
    )
  })

  it('clamps limit to max 100', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetQuery.mockReturnValue({ limit: '200' })
    stubDb()
    mockCountGet.mockReturnValue({ count: 0 })
    mockAll.mockReturnValue([])

    const result = await handler(mockEvent)
    expect(result).toEqual(expect.objectContaining({ page: 1 }))
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
