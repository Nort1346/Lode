import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockUpdateSet = vi.fn(() => ({ where: vi.fn(() => ({ run: mockRun })) }))
const mockGetUser = vi.fn()
const mockHash = vi.hoisted(() => vi.fn())
const mockReadBody = vi.fn()
const mockGetRouterParam = vi.fn()
const mockLogActivity = vi.fn()
const mockSyncUserUpdate = vi.hoisted(() => vi.fn())
const mockSyncUserDisable = vi.hoisted(() => vi.fn())
const mockSyncUserEnable = vi.hoisted(() => vi.fn())
const mockGetDefaultSyncSettings = vi.hoisted(() => vi.fn())
const mockGetPlexSyncSettings = vi.hoisted(() => vi.fn())
const mockGetSyncUserSettings = vi.hoisted(() => vi.fn())
const mockUpsertSyncUserSettings = vi.hoisted(() => vi.fn())

vi.mock('@node-rs/bcrypt', () => ({
  hash: mockHash
}))

vi.mock('#server/utils/sync', () => ({
  syncUserUpdate: mockSyncUserUpdate,
  syncUserDisable: mockSyncUserDisable,
  syncUserEnable: mockSyncUserEnable,
  getDefaultSyncSettings: mockGetDefaultSyncSettings,
  getPlexSyncSettings: mockGetPlexSyncSettings,
  getSyncUserSettings: mockGetSyncUserSettings,
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
    mockUpdateSet.mockReset()
    mockUpdateSet.mockReturnValue({ where: vi.fn(() => ({ run: mockRun })) })
    mockGetUser.mockReset()
    mockHash.mockReset()
    mockLogActivity.mockReset()
    mockSyncUserUpdate.mockReset()
    mockSyncUserDisable.mockReset()
    mockSyncUserEnable.mockReset()
    mockGetDefaultSyncSettings.mockReturnValue({})
    mockGetPlexSyncSettings.mockReturnValue({})
    mockGetSyncUserSettings.mockReset()
    mockGetSyncUserSettings.mockResolvedValue({ libraryAccess: 'all' })
    mockUpsertSyncUserSettings.mockReset()
    mockSyncUserUpdate.mockResolvedValue(undefined)
    mockSyncUserDisable.mockResolvedValue(undefined)
    mockSyncUserEnable.mockResolvedValue(undefined)
    mockHash.mockResolvedValue('$2b$12$hashed')
  })

  const mockEvent = {} as never

  function stubDb(existingUser: unknown, usernameTaken: unknown = undefined) {
    let callCount = 0
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              get: vi.fn(() => {
                callCount++
                return callCount === 1 ? existingUser : usernameTaken
              })
            }))
          }))
        })),
        update: vi.fn(() => ({
          set: mockUpdateSet
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

  it('persists per-provider settings and passes the plex override to sync', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    mockReadBody.mockResolvedValue({
      username: 'newname',
      jellyfinLibraryAccess: ['jf1'],
      plexLibraryAccess: ['1'],
      plexEnableLiveTvAccess: false,
      plexEnableSync: false
    })
    stubDb({ id: 'u1', username: 'oldname', isActive: true })

    await handler(mockEvent)

    expect(mockGetPlexSyncSettings).toHaveBeenCalledWith({
      libraryAccess: ['1'],
      enableLiveTvAccess: false,
      enableSync: false
    })
    expect(mockUpsertSyncUserSettings).toHaveBeenCalledWith('u1', 'jellyfin', {})
    expect(mockUpsertSyncUserSettings).toHaveBeenCalledWith('u1', 'plex', {})
    expect(mockSyncUserUpdate).toHaveBeenCalledWith('u1', { username: 'newname', password: '' }, {}, { plex: {} })
  })

  it('keeps stored provider settings when the payload omits them', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    mockReadBody.mockResolvedValue({ password: 'temp1234' })
    mockGetSyncUserSettings.mockImplementation(async (_id: string, provider: string) =>
      provider === 'plex'
        ? { libraryAccess: ['7'], enableLiveTvAccess: false, enableSync: false }
        : { libraryAccess: ['jf'], enableVideoTranscoding: false }
    )
    stubDb({ id: 'u1', username: 'user1', isActive: true })

    await handler(mockEvent)

    expect(mockGetPlexSyncSettings).toHaveBeenCalledWith({
      libraryAccess: ['7'],
      enableLiveTvAccess: false,
      enableSync: false
    })
    expect(mockGetDefaultSyncSettings).toHaveBeenCalledWith(
      expect.objectContaining({ libraryAccess: ['jf'], enableVideoTranscoding: false })
    )
  })

  it('throws 400 for a malformed plexLibraryAccess payload', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    mockReadBody.mockResolvedValue({ plexLibraryAccess: 42 })
    stubDb({ id: 'u1', username: 'user1', isActive: true })

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid Plex user settings')
    expect(mockUpsertSyncUserSettings).not.toHaveBeenCalled()
  })

  it('throws 409 when the new username is taken', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    mockReadBody.mockResolvedValue({ username: 'other' })
    stubDb({ id: 'u1', username: 'oldname', isActive: true }, { id: 'u2', username: 'other' })

    await expect(handler(mockEvent)).rejects.toThrow('409: Username already exists')
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('skips the uniqueness check when the username is unchanged', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    mockReadBody.mockResolvedValue({ username: 'oldname' })
    stubDb({ id: 'u1', username: 'oldname', isActive: true }, { id: 'u2', username: 'oldname' })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
  })

  it('throws 400 for empty or oversized username', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    mockReadBody.mockResolvedValue({ username: '   ' })
    stubDb({ id: 'u1', username: 'oldname', isActive: true })

    await expect(handler(mockEvent)).rejects.toThrow('400: Username must be 1-64 characters')

    stubDb({ id: 'u1', username: 'oldname', isActive: true })
    mockReadBody.mockResolvedValue({ username: 'x'.repeat(65) })
    await expect(handler(mockEvent)).rejects.toThrow('400: Username must be 1-64 characters')
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

  it('does not force a password change when the admin assigns a password', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('u1')
    mockReadBody.mockResolvedValue({ password: 'temp1234' })
    stubDb({ id: 'u1', username: 'user1', isActive: true })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ password: '$2b$12$hashed', mustChangePassword: false })
    )
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
