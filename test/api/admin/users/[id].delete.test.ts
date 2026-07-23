import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockGetUser = vi.fn()
const mockGetRouterParam = vi.fn()
const mockLogActivity = vi.fn()
const mockSyncUserDelete = vi.hoisted(() => vi.fn())
const mockDelete = vi.fn(() => ({ where: vi.fn(() => ({ run: mockRun, get: vi.fn() })) }))

vi.mock('#server/utils/sync', () => ({
  syncUserDelete: mockSyncUserDelete
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  users: { id: 'id', role: 'role' },
  sessions: { id: 'id', userId: 'userId' }
}))

import handler from '#server/api/admin/users/[id].delete'
import { users, sessions } from '#server/database/schema'

describe('admin/users/[id].delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('getRouterParam', mockGetRouterParam)
    vi.stubGlobal('logActivity', mockLogActivity)
    mockGetRouterParam.mockReset()
    mockRun.mockReset()
    mockGetUser.mockReset()
    mockLogActivity.mockReset()
    mockSyncUserDelete.mockReset()
    mockSyncUserDelete.mockResolvedValue(undefined)
  })

  const mockEvent = {} as never

  function stubDb(existingUser: unknown) {
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              get: vi.fn(() => existingUser)
            }))
          }))
        })),
        delete: mockDelete
      }))
    )
  }

  it('deletes user after jellyfin sync', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    stubDb({ id: 'u1', username: 'user1', role: 'user' })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockSyncUserDelete).toHaveBeenCalledWith('u1')
    expect(mockRun).toHaveBeenCalled()
    expect(mockLogActivity).toHaveBeenCalled()
  })

  it('deletes all sessions for the user when deleted', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    stubDb({ id: 'u1', username: 'user1', role: 'user' })

    await handler(mockEvent)

    expect(mockDelete).toHaveBeenCalledWith(users)
    expect(mockDelete).toHaveBeenCalledWith(sessions)
  })

  it('throws 400 when id missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue(null)

    await expect(handler(mockEvent)).rejects.toThrow('400: User ID is required')
  })

  it('throws 404 when user not found', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    stubDb(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('404: User not found')
  })

  it('throws 400 when trying to delete admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u2')
    stubDb({ id: 'u2', username: 'otheradmin', role: 'admin' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Cannot delete admin users')
  })

  it('throws 502 when jellyfin delete fails', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    mockSyncUserDelete.mockRejectedValue(new Error('Jellyfin error'))
    stubDb({ id: 'u1', username: 'user1', role: 'user' })

    await expect(handler(mockEvent)).rejects.toThrow('502: Failed to delete user from Jellyfin')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
