import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockAll = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)

vi.mock('#server/utils/db', () => ({
  useDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            all: mockAll
          }))
        }))
      }))
    }))
  }))
}))

vi.mock('#server/database/schema', () => ({
  requests: { status: 'status', createdAt: 'createdAt' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  desc: vi.fn(() => ({}))
}))

import handler from '#server/api/requests/list.get'
import { getQuery } from 'h3'

describe('requests/list.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('returns paginated requests for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'admin' } })
    vi.mocked(getQuery).mockReturnValue({})
    mockAll.mockReturnValue([
      { id: 'r1', mediaTitle: 'Movie 1' },
      { id: 'r2', mediaTitle: 'Movie 2' }
    ])

    const result = await handler(mockEvent)
    expect(result).toEqual({
      items: [
        { id: 'r1', mediaTitle: 'Movie 1' },
        { id: 'r2', mediaTitle: 'Movie 2' }
      ],
      total: 2,
      totalPages: 1,
      page: 1
    })
  })

  it('filters by status', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'admin' } })
    vi.mocked(getQuery).mockReturnValue({ status: 'pending' })
    mockAll.mockReturnValue([{ id: 'r1', status: 'pending' }])

    const result = await handler(mockEvent)
    expect(result.total).toBe(1)
  })

  it('paginates results', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'admin' } })
    vi.mocked(getQuery).mockReturnValue({ page: '1' })

    const items = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}` }))
    mockAll.mockReturnValue(items)

    const result = await handler(mockEvent)
    expect(result.items).toHaveLength(50)
    expect(result.total).toBe(60)
    expect(result.totalPages).toBe(2)
  })

  it('throws 403 for non-admin users', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Admin access required')
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('403: Admin access required')
  })
})
