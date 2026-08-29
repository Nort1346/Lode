import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth, createMockDb } from '../../helpers'

const { mockHash } = vi.hoisted(() => ({
  mockHash: vi.fn(async () => 'hashed')
}))

vi.mock('@node-rs/bcrypt', () => ({
  hash: mockHash
}))

vi.mock('node:crypto', () => ({
  randomBytes: vi.fn((len: number) => Buffer.alloc(len, 1))
}))

const { mockExistsSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => false)
}))

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync
}))

const { mockReadFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(async () => Buffer.from('avatar-bytes'))
}))

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile
}))

vi.mock('#server/database/schema', () => ({
  users: { id: 'id', username: 'username', password: 'password', avatarUrl: 'avatarUrl' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ key: val }))
}))

const { mockSyncUserCreate, mockSyncUserUpdate, mockGetSyncUserSettings, mockGetProviderUserId, mockSyncAvatar } =
  vi.hoisted(() => ({
    mockSyncUserCreate: vi.fn(),
    mockSyncUserUpdate: vi.fn(),
    mockGetSyncUserSettings: vi.fn(),
    mockGetProviderUserId: vi.fn(),
    mockSyncAvatar: vi.fn()
  }))

vi.mock('#server/utils/sync', () => ({
  syncUserCreate: mockSyncUserCreate,
  syncUserUpdate: mockSyncUserUpdate,
  getSyncUserSettings: mockGetSyncUserSettings,
  getProviderUserId: mockGetProviderUserId,
  syncAvatar: mockSyncAvatar
}))

const mockGetUserSession = vi.fn()
vi.stubGlobal('getRouterParam', vi.fn())

import handler from '#server/api/admin/users/[id]/sync.post'

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    username: 'user1',
    password: 'hash',
    avatarUrl: null,
    ...overrides
  }
}

function stubDb(user: Record<string, unknown> | undefined) {
  const mockDb = createMockDb({ selectResult: user })
  vi.stubGlobal('useDb', () => mockDb)
  return mockDb
}

describe('admin/users/[id]/sync.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetUserSession.mockReset()
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    vi.stubGlobal('getRouterParam', vi.fn())
    mockHash.mockReset()
    mockHash.mockResolvedValue('hashed')
    mockSyncUserCreate.mockReset()
    mockSyncUserCreate.mockResolvedValue(undefined)
    mockSyncUserUpdate.mockReset()
    mockSyncUserUpdate.mockResolvedValue(undefined)
    mockGetSyncUserSettings.mockReset()
    mockGetSyncUserSettings.mockResolvedValue({ autoSync: true, syncAvatar: true })
    mockGetProviderUserId.mockReset()
    mockGetProviderUserId.mockResolvedValue(null)
    mockSyncAvatar.mockReset()
    mockSyncAvatar.mockResolvedValue(undefined)
    mockExistsSync.mockReset()
    mockExistsSync.mockReturnValue(false)
    mockReadFile.mockReset()
    mockReadFile.mockResolvedValue(Buffer.from('avatar-bytes'))
  })

  const mockEvent = {} as never

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })

  it('throws 400 when the route ID is missing', async () => {
    vi.stubGlobal(
      'getRouterParam',
      vi.fn(() => null)
    )

    await expect(handler(mockEvent)).rejects.toThrow('400: User ID is required')
  })

  it('throws 404 when the target user does not exist', async () => {
    vi.stubGlobal(
      'getRouterParam',
      vi.fn(() => 'u1')
    )
    stubDb(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('404: User not found')
  })

  it('re-syncs an existing mapping without generating a password', async () => {
    vi.stubGlobal(
      'getRouterParam',
      vi.fn(() => 'u1')
    )
    stubDb(makeUser())
    mockGetProviderUserId.mockResolvedValue('jf-1')

    const result = await handler(mockEvent)

    expect(result).toEqual({ success: true, action: 'synced', tempPassword: undefined })
    expect(mockSyncUserUpdate).toHaveBeenCalledWith(
      'u1',
      { username: 'user1', password: '' },
      {
        autoSync: true,
        syncAvatar: true
      }
    )
    expect(mockSyncUserCreate).not.toHaveBeenCalled()
    expect(mockHash).not.toHaveBeenCalled()
  })

  it('creates a new mapping with a generated temp password when none exists', async () => {
    vi.stubGlobal(
      'getRouterParam',
      vi.fn(() => 'u1')
    )
    const mockDb = stubDb(makeUser())
    mockGetProviderUserId.mockResolvedValue(null)

    const result = await handler(mockEvent)

    expect(result.success).toBe(true)
    expect(result.action).toBe('created')
    expect(typeof result.tempPassword).toBe('string')
    expect(result.tempPassword).toHaveLength(16)
    expect(mockHash).toHaveBeenCalledWith(result.tempPassword, 12)
    expect(mockDb._mocks.runMock).toHaveBeenCalled()
    expect(mockSyncUserCreate).toHaveBeenCalledWith(
      'u1',
      { username: 'user1', password: result.tempPassword },
      { autoSync: true, syncAvatar: true }
    )
    expect(mockSyncUserUpdate).not.toHaveBeenCalled()
  })

  it('throws 500 when the re-sync update fails', async () => {
    vi.stubGlobal(
      'getRouterParam',
      vi.fn(() => 'u1')
    )
    stubDb(makeUser())
    mockGetProviderUserId.mockResolvedValue('jf-1')
    mockSyncUserUpdate.mockRejectedValue(new Error('jellyfin down'))

    await expect(handler(mockEvent)).rejects.toThrow('500: Sync failed: jellyfin down')
  })

  it('throws 500 when the create sync fails', async () => {
    vi.stubGlobal(
      'getRouterParam',
      vi.fn(() => 'u1')
    )
    stubDb(makeUser())
    mockGetProviderUserId.mockResolvedValue(null)
    mockSyncUserCreate.mockRejectedValue(new Error('jellyfin down'))

    await expect(handler(mockEvent)).rejects.toThrow('500: Sync failed: jellyfin down')
  })

  it('syncs the avatar file when one exists on disk', async () => {
    vi.stubGlobal(
      'getRouterParam',
      vi.fn(() => 'u1')
    )
    stubDb(makeUser({ avatarUrl: '/avatars/u1.jpg' }))
    mockGetProviderUserId.mockResolvedValue('jf-1')
    mockExistsSync.mockReturnValue(true)

    const result = await handler(mockEvent)

    expect(result.action).toBe('synced')
    expect(mockReadFile).toHaveBeenCalled()
    expect(mockSyncAvatar).toHaveBeenCalledWith('u1', Buffer.from('avatar-bytes'))
  })

  it('skips avatar sync when the file is missing', async () => {
    vi.stubGlobal(
      'getRouterParam',
      vi.fn(() => 'u1')
    )
    stubDb(makeUser({ avatarUrl: '/avatars/u1.jpg' }))
    mockGetProviderUserId.mockResolvedValue('jf-1')
    mockExistsSync.mockReturnValue(false)

    await handler(mockEvent)

    expect(mockReadFile).not.toHaveBeenCalled()
    expect(mockSyncAvatar).not.toHaveBeenCalled()
  })
})
