import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockAll = vi.fn()

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  leftJoin: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  sessions: {
    id: 'id',
    userId: 'userId',
    ip: 'ip',
    userAgent: 'userAgent',
    deviceName: 'deviceName',
    createdAt: 'createdAt',
    lastActiveAt: 'lastActiveAt'
  },
  users: { id: 'id', username: 'username', role: 'role' }
}))

import handler from '#server/api/admin/sessions.get'

describe('admin/sessions.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
  })

  const mockEvent = {} as never

  it('returns all sessions for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            leftJoin: vi.fn(() => ({
              all: mockAll
            }))
          }))
        }))
      }))
    )
    mockAll.mockReturnValue([{ id: 's1', userId: 'u1', ip: '1.2.3.4', username: 'user1', role: 'user' }])

    const result = await handler(mockEvent)
    expect(result).toEqual([{ id: 's1', userId: 'u1', ip: '1.2.3.4', username: 'user1', role: 'user' }])
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
