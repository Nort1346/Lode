import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockReadBody = vi.fn()
const mockGetRequestHeader = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('readBody', mockReadBody)
vi.stubGlobal('getRequestHeader', mockGetRequestHeader)

const mockRandomUUID = vi.hoisted(() => vi.fn())

vi.mock('node:crypto', () => ({
  randomUUID: mockRandomUUID
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  pushSubscriptions: { endpoint: 'endpoint', id: 'id', userId: 'userId' }
}))

import handler from '#server/api/notifications/subscribe.post'

describe('notifications/subscribe.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadBody.mockReset()
    mockGetRequestHeader.mockReset()
    mockRandomUUID.mockReset()
    mockRandomUUID.mockReturnValue('sub-id-1')
    mockGetRequestHeader.mockReturnValue('Mozilla/5.0')
  })

  const mockEvent = {} as never

  function stubDb(existing: unknown = undefined) {
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              get: vi.fn(() => existing)
            }))
          }))
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            run: vi.fn(() => ({ changes: 1 }))
          }))
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              run: vi.fn(() => ({ changes: 1 }))
            }))
          }))
        }))
      }))
    )
  }

  it('creates new subscription', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockReadBody.mockResolvedValue({
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'key1', auth: 'auth1' }
    })
    stubDb(undefined)

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, id: 'sub-id-1' })
  })

  it('updates existing subscription', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockReadBody.mockResolvedValue({
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'key1', auth: 'auth1' }
    })
    stubDb({ id: 'existing-id', endpoint: 'https://push.example.com/sub1' })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, id: 'existing-id' })
  })

  it('throws 400 when endpoint missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockReadBody.mockResolvedValue({ keys: { p256dh: 'key1', auth: 'auth1' } })
    stubDb()

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid subscription')
  })

  it('throws 400 when keys missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockReadBody.mockResolvedValue({ endpoint: 'https://push.example.com/sub1' })
    stubDb()

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid subscription')
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Unauthorized')
  })
})
