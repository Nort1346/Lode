import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockDb } from '../helpers'

const { mockHash, mockCompare } = vi.hoisted(() => ({
  mockHash: vi.fn(async () => 'hashed'),
  mockCompare: vi.fn(async () => true)
}))

vi.mock('@node-rs/bcrypt', () => ({
  hash: mockHash,
  compare: mockCompare
}))

vi.mock('#server/database/schema', () => ({
  users: { id: 'id', password: 'password', username: 'username' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ key: val }))
}))

const { mockSyncUserUpdate, mockGetSyncUserSettings, mockGetProviderUserId } = vi.hoisted(() => ({
  mockSyncUserUpdate: vi.fn(),
  mockGetSyncUserSettings: vi.fn(),
  mockGetProviderUserId: vi.fn()
}))

vi.mock('#server/utils/sync', () => ({
  syncUserUpdate: mockSyncUserUpdate,
  getSyncUserSettings: mockGetSyncUserSettings,
  getProviderUserId: mockGetProviderUserId
}))

const mockGetUserSession = vi.fn()
vi.stubGlobal('getUserSession', mockGetUserSession)
const mockLogActivity = vi.fn()
vi.stubGlobal('logActivity', mockLogActivity)

import handler from '#server/api/user/password.post'

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    username: 'user1',
    password: 'old-hash',
    role: 'user',
    ...overrides
  }
}

function stubBody(body: Record<string, unknown>) {
  vi.stubGlobal(
    'readBody',
    vi.fn(async () => body)
  )
}

describe('user/password.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('getUserSession', mockGetUserSession)
    vi.stubGlobal('logActivity', mockLogActivity)
    mockGetUserSession.mockReset()
    mockLogActivity.mockReset()
    mockHash.mockReset()
    mockHash.mockResolvedValue('hashed')
    mockCompare.mockReset()
    mockCompare.mockResolvedValue(true)
    mockSyncUserUpdate.mockReset()
    mockSyncUserUpdate.mockResolvedValue(undefined)
    mockGetSyncUserSettings.mockReset()
    mockGetSyncUserSettings.mockResolvedValue({ autoSync: true, syncAvatar: true })
    mockGetProviderUserId.mockReset()
    mockGetProviderUserId.mockResolvedValue(null)
  })

  const mockEvent = {} as never

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: null })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })

  it('throws 400 when the body is missing passwords', async () => {
    mockGetUserSession.mockResolvedValue({ user: makeUser() })
    stubBody({})

    await expect(handler(mockEvent)).rejects.toThrow('400: Current and new password are required')
  })

  it('throws 400 when the new password is too short', async () => {
    mockGetUserSession.mockResolvedValue({ user: makeUser() })
    stubBody({ currentPassword: 'oldpass1', newPassword: 'short' })

    await expect(handler(mockEvent)).rejects.toThrow('400: New password must be at least 8 characters')
  })

  it('throws 400 when the new password equals the current one', async () => {
    mockGetUserSession.mockResolvedValue({ user: makeUser() })
    stubBody({ currentPassword: 'samepass1', newPassword: 'samepass1' })

    await expect(handler(mockEvent)).rejects.toThrow('400: New password must differ from current')
  })

  it('throws 404 when the session user does not exist in the DB', async () => {
    mockGetUserSession.mockResolvedValue({ user: makeUser() })
    stubBody({ currentPassword: 'oldpass1', newPassword: 'newpass123' })
    vi.stubGlobal('useDb', () => createMockDb())

    await expect(handler(mockEvent)).rejects.toThrow('404: User not found')
  })

  it('throws 400 when the current password is invalid', async () => {
    mockGetUserSession.mockResolvedValue({ user: makeUser() })
    stubBody({ currentPassword: 'wrongpass', newPassword: 'newpass123' })
    vi.stubGlobal('useDb', () => createMockDb({ selectResult: makeUser() }))
    mockCompare.mockResolvedValue(false)

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid current password')
  })

  it('updates the password when the user has no Jellyfin mapping', async () => {
    mockGetUserSession.mockResolvedValue({ user: makeUser() })
    stubBody({ currentPassword: 'oldpass1', newPassword: 'newpass123' })
    const mockDb = createMockDb({ selectResult: makeUser() })
    vi.stubGlobal('useDb', () => mockDb)
    mockGetProviderUserId.mockResolvedValue(null)

    const result = await handler(mockEvent)

    expect(result).toEqual({ success: true })
    expect(mockHash).toHaveBeenCalledWith('newpass123', 12)
    expect(mockDb._mocks.runMock).toHaveBeenCalled()
    expect(mockSyncUserUpdate).not.toHaveBeenCalled()
    expect(mockLogActivity).toHaveBeenCalledWith(
      mockEvent,
      expect.objectContaining({ action: 'user_password_change', userId: 'u1', username: 'user1' })
    )
  })

  it('syncs the new password to Jellyfin when a mapping exists', async () => {
    mockGetUserSession.mockResolvedValue({ user: makeUser() })
    stubBody({ currentPassword: 'oldpass1', newPassword: 'newpass123' })
    vi.stubGlobal('useDb', () => createMockDb({ selectResult: makeUser() }))
    mockGetProviderUserId.mockResolvedValue('jf-1')

    const result = await handler(mockEvent)

    expect(result).toEqual({ success: true })
    expect(mockGetSyncUserSettings).toHaveBeenCalledWith('u1', 'jellyfin')
    expect(mockSyncUserUpdate).toHaveBeenCalledWith(
      'u1',
      { username: 'user1', password: 'newpass123' },
      {
        autoSync: true,
        syncAvatar: true
      }
    )
  })

  it('still succeeds when the Jellyfin sync fails', async () => {
    mockGetUserSession.mockResolvedValue({ user: makeUser() })
    stubBody({ currentPassword: 'oldpass1', newPassword: 'newpass123' })
    vi.stubGlobal('useDb', () => createMockDb({ selectResult: makeUser() }))
    mockGetProviderUserId.mockResolvedValue('jf-1')
    mockSyncUserUpdate.mockRejectedValue(new Error('jellyfin down'))

    const result = await handler(mockEvent)

    expect(result).toEqual({ success: true })
  })
})
