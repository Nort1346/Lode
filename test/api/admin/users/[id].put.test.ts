import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockRun = vi.fn()
const mockGetUser = vi.fn()
const mockHash = vi.hoisted(() => vi.fn())
const mockReadBody = vi.fn()
const mockGetRouterParam = vi.fn()
const mockLogActivity = vi.fn()
const mockSyncUserUpdate = vi.hoisted(() => vi.fn())
const mockSyncUserDisable = vi.hoisted(() => vi.fn())
const mockSyncUserEnable = vi.hoisted(() => vi.fn())
const mockGetDefaultSyncSettings = vi.hoisted(() => vi.fn())
const mockUpsertSyncUserSettings = vi.hoisted(() => vi.fn())

vi.mock('@node-rs/bcrypt', () => ({
  hash: mockHash
}))

vi.mock('#server/utils/sync', () => ({
  syncUserUpdate: mockSyncUserUpdate,
  syncUserDisable: mockSyncUserDisable,
  syncUserEnable: mockSyncUserEnable,
  getDefaultSyncSettings: mockGetDefaultSyncSettings,
  upsertSyncUserSettings: mockUpsertSyncUserSettings
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  users: { id: 'id' }
}))

import handler from '#server/api/admin/users/[id].put'

describe('admin/users/[id].put', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('readBody', mockReadBody)
    vi.stubGlobal('getRouterParam', mockGetRouterParam)
    vi.stubGlobal('logActivity', mockLogActivity)
    mockReadBody.mockReset()
    mockGetRouterParam.mockReset()
    mockRun.mockReset()
    mockGetUser.mockReset()
    mockHash.mockReset()
    mockLogActivity.mockReset()
    mockSyncUserUpdate.mockReset()
    mockSyncUserDisable.mockReset()
    mockSyncUserEnable.mockReset()
    mockGetDefaultSyncSettings.mockReturnValue({})
    mockUpsertSyncUserSettings.mockReset()
    mockSyncUserUpdate.mockResolvedValue(undefined)
    mockSyncUserDisable.mockResolvedValue(undefined)
    mockSyncUserEnable.mockResolvedValue(undefined)
    mockHash.mockResolvedValue('$2b$12$hashed')
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
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              run: mockRun
            }))
          }))
        }))
      }))
    )
  }

  it('updates user fields', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    mockReadBody.mockResolvedValue({ username: 'newname' })
    stubDb({ id: 'u1', username: 'oldname', isActive: true })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockLogActivity).toHaveBeenCalled()
  })

  it('throws 400 when id missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue(null)

    await expect(handler(mockEvent)).rejects.toThrow('400: User ID is required')
  })

  it('throws 404 when user not found', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    mockReadBody.mockResolvedValue({ username: 'test' })
    stubDb(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('404: User not found')
  })

  it('disables user and syncs to jellyfin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    mockReadBody.mockResolvedValue({ isActive: false })
    stubDb({ id: 'u1', username: 'user1', isActive: true })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockSyncUserDisable).toHaveBeenCalledWith('u1')
  })

  it('enables user and clears expiresAt', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    mockReadBody.mockResolvedValue({ isActive: true })
    stubDb({ id: 'u1', username: 'user1', isActive: false })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockSyncUserEnable).toHaveBeenCalledWith('u1')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
