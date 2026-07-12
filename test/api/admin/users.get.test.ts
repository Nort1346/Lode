import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockAllUsers = vi.fn()
const mockAllProviders = vi.fn()
const mockGetSettings = vi.fn()

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  users: { id: 'id' },
  syncProviders: {
    userId: 'userId',
    providerName: 'providerName',
    providerUserId: 'providerUserId',
    syncStatus: 'syncStatus',
    lastSyncError: 'lastSyncError'
  },
  syncUserSettings: {
    userId: 'userId',
    providerName: 'providerName',
    libraryAccess: 'libraryAccess',
    enableVideoTranscoding: 'enableVideoTranscoding',
    enableAudioTranscoding: 'enableAudioTranscoding',
    enableRemuxing: 'enableRemuxing',
    enableLiveTvAccess: 'enableLiveTvAccess',
    enableLiveTvManagement: 'enableLiveTvManagement',
    maxActiveSessions: 'maxActiveSessions'
  }
}))

import handler from '#server/api/admin/users.get'

describe('admin/users.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockAllUsers.mockReset()
    mockAllProviders.mockReset()
    mockGetSettings.mockReset()
  })

  const mockEvent = {} as never

  function stubDb(users: unknown[], providers: unknown[] = [], settings: unknown = undefined) {
    let callCount = 0
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              all: vi.fn(() => {
                callCount++
                if (callCount === 1) return users
                if (callCount === 2) return providers
                return []
              }),
              get: vi.fn(() => settings)
            })),
            all: vi.fn(() => {
              callCount++
              return users
            })
          }))
        }))
      }))
    )
  }

  it('returns all users for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    stubDb([{ id: 'u1', username: 'user1', role: 'user' }], [])

    const result = await handler(mockEvent)
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
    const users = result as Array<{ id: string }>
    expect(users[0]!.id).toBe('u1')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
