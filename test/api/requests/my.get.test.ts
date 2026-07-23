import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockAll = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)

vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            get: vi.fn(),
            all: mockAll
          }))
        }))
      }))
    }))
  }))
)

vi.mock('#server/database/schema', () => ({
  requests: { userId: 'userId', createdAt: 'createdAt' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  desc: vi.fn(() => ({}))
}))

import handler from '#server/api/requests/my.get'

describe('requests/my.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('returns user requests', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockAll.mockReturnValue([{ id: 'r1', userId: 'u1', mediaTitle: 'Test Movie', status: 'pending' }])

    const result = await handler(mockEvent)
    expect(result).toEqual({
      requests: [{ id: 'r1', userId: 'u1', mediaTitle: 'Test Movie', status: 'pending' }]
    })
  })

  it('returns empty array when no requests', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockAll.mockReturnValue([])

    const result = await handler(mockEvent)
    expect(result).toEqual({ requests: [] })
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
