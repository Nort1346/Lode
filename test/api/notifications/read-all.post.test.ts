import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockMarkAllAsRead = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('markAllAsRead', mockMarkAllAsRead)

import handler from '#server/api/notifications/read-all.post'

describe('notifications/read-all.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMarkAllAsRead.mockReset()
  })

  const mockEvent = {} as never

  it('marks all as read and returns count', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockMarkAllAsRead.mockReturnValue(5)

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, count: 5 })
    expect(mockMarkAllAsRead).toHaveBeenCalledWith('u1')
  })

  it('returns 0 count when no notifications', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockMarkAllAsRead.mockReturnValue(0)

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, count: 0 })
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Unauthorized')
  })
})
