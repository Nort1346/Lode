import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockReadBody = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('readBody', mockReadBody)

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  pushSubscriptions: { endpoint: 'endpoint', userId: 'userId', id: 'id' }
}))

import handler from '#server/api/notifications/unsubscribe.post'

describe('notifications/unsubscribe.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadBody.mockReset()
  })

  const mockEvent = {} as never

  function stubDb(options: { allResult?: unknown[] } = {}) {
    const runMock = vi.fn()
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              all: vi.fn(() => options.allResult ?? []),
              get: vi.fn(() => undefined)
            }))
          }))
        })),
        delete: vi.fn(() => ({
          where: vi.fn(() => ({
            run: runMock
          }))
        }))
      }))
    )
  }

  it('deletes specific endpoint subscription', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockReadBody.mockResolvedValue({ endpoint: 'https://push.example.com/sub1' })
    stubDb()

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
  })

  it('deletes all subscriptions when no endpoint', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockReadBody.mockResolvedValue({})
    stubDb({ allResult: [{ id: 's1' }, { id: 's2' }] })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, count: 2 })
  })

  it('returns 0 count when no subscriptions', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockReadBody.mockResolvedValue({})
    stubDb({ allResult: [] })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, count: 0 })
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Unauthorized')
  })
})
