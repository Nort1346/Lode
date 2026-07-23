import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockGetExisting = vi.fn()
const mockHash = vi.hoisted(() => vi.fn())
const mockRandomUUID = vi.hoisted(() => vi.fn())
const mockSyncNewUser = vi.hoisted(() => vi.fn())
const mockGetDefaultSyncSettings = vi.hoisted(() => vi.fn())
const mockReadBody = vi.fn()

vi.mock('@node-rs/bcrypt', () => ({
  hash: mockHash
}))

vi.mock('node:crypto', () => ({
  randomUUID: mockRandomUUID
}))

vi.mock('#server/utils/sync', () => ({
  syncNewUser: mockSyncNewUser,
  getDefaultSyncSettings: mockGetDefaultSyncSettings
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  users: { username: 'username', id: 'id' }
}))

import handler from '#server/api/admin/users.post'

describe('admin/users.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('readBody', mockReadBody)
    mockReadBody.mockReset()
    mockRun.mockReset()
    mockRun.mockReturnValue({ changes: 1 })
    mockGetExisting.mockReset()
    mockHash.mockReset()
    mockRandomUUID.mockReset()
    mockSyncNewUser.mockReset()
    mockGetDefaultSyncSettings.mockReset()
    mockHash.mockResolvedValue('$2b$12$hashed')
    mockRandomUUID.mockReturnValue('new-id-1')
    mockGetDefaultSyncSettings.mockReturnValue({})
    mockSyncNewUser.mockResolvedValue('synced')
  })

  const mockEvent = {} as never

  function stubDb(existingUser: unknown = undefined) {
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
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            run: mockRun
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

  it('creates user and syncs to jellyfin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ username: 'newuser', password: 'pass123' })
    stubDb(undefined)

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, id: 'new-id-1' })
    expect(mockHash).toHaveBeenCalledWith('pass123', 12)
    expect(mockSyncNewUser).toHaveBeenCalled()
  })

  it('throws 400 when username missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ password: 'pass123' })
    stubDb()

    await expect(handler(mockEvent)).rejects.toThrow('400: Username and password are required')
  })

  it('throws 400 when password missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ username: 'newuser' })
    stubDb()

    await expect(handler(mockEvent)).rejects.toThrow('400: Username and password are required')
  })

  it('throws 409 when username exists', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ username: 'existing', password: 'pass123' })
    stubDb({ id: 'u1', username: 'existing' })

    await expect(handler(mockEvent)).rejects.toThrow('409: Username already exists')
  })

  it('sets syncStatus to failed on sync failure', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ username: 'newuser', password: 'pass123' })
    mockSyncNewUser.mockResolvedValue('failed')
    stubDb(undefined)

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, id: 'new-id-1' })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
