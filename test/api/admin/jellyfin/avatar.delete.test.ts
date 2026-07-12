import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockRun = vi.fn()
const mockGetUser = vi.fn()
const mockReadBody = vi.fn()
const mockSyncAvatarDelete = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/sync', () => ({
  syncAvatarDelete: mockSyncAvatarDelete
}))

vi.mock('node:fs', () => ({
  unlinkSync: vi.fn()
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  users: { id: 'id' }
}))

import handler from '#server/api/admin/jellyfin/avatar.delete'

describe('admin/jellyfin/avatar.delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('readBody', mockReadBody)
    mockReadBody.mockReset()
    mockRun.mockReset()
    mockGetUser.mockReset()
    mockSyncAvatarDelete.mockReset()
    mockSyncAvatarDelete.mockResolvedValue(undefined)
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

  it('deletes avatar and syncs', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ userId: 'u1' })
    stubDb({ id: 'u1' })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockSyncAvatarDelete).toHaveBeenCalledWith('u1')
    expect(mockRun).toHaveBeenCalled()
  })

  it('throws 400 when userId missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({})
    stubDb(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('400: userId is required')
  })

  it('throws 404 when user not found', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ userId: 'u1' })
    stubDb(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('404: User not found')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
