import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUseJellyfin = vi.hoisted(() => vi.fn())
const mockGetSetting = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/clients/jellyfin', () => ({
  useJellyfin: mockUseJellyfin
}))

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

vi.mock('#server/types/settings', () => ({
  SETTINGS: { JELLYFIN_SYNC_ENABLED: 'jellyfin_sync_enabled' }
}))

import { JellyfinSyncProvider } from '#server/utils/sync/providers/jellyfin'
import type { SyncUserSettings } from '#server/utils/sync/types'

const mockClient = {
  createUser: vi.fn(),
  updateUserPassword: vi.fn(),
  getUserByName: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  disableUser: vi.fn(),
  enableUser: vi.fn(),
  updateUserPolicy: vi.fn(),
  setUserImage: vi.fn(),
  deleteUserImage: vi.fn(),
  getLibraries: vi.fn(),
  isItemInLibrary: vi.fn()
}

function settings(over: Partial<SyncUserSettings> = {}): SyncUserSettings {
  return {
    libraryAccess: ['all'],
    enableVideoTranscoding: false,
    enableAudioTranscoding: false,
    enableRemuxing: false,
    enableLiveTvAccess: false,
    enableLiveTvManagement: false,
    maxActiveSessions: 1,
    ...over
  }
}

describe('JellyfinSyncProvider', () => {
  let provider: JellyfinSyncProvider

  beforeEach(() => {
    vi.clearAllMocks()
    provider = new JellyfinSyncProvider()
  })

  it('isEnabled is false when the setting is disabled', async () => {
    mockGetSetting.mockResolvedValue('false')
    mockUseJellyfin.mockReturnValue(mockClient)

    await expect(provider.isEnabled()).resolves.toBe(false)
    expect(mockUseJellyfin).not.toHaveBeenCalled()
  })

  it('isEnabled is true when enabled and a client exists', async () => {
    mockGetSetting.mockResolvedValue('true')
    mockUseJellyfin.mockReturnValue(mockClient)

    await expect(provider.isEnabled()).resolves.toBe(true)
  })

  it('isEnabled is false when no client is configured', async () => {
    mockGetSetting.mockResolvedValue('true')
    mockUseJellyfin.mockReturnValue(null)

    await expect(provider.isEnabled()).resolves.toBe(false)
  })

  it('createUser returns the provider user id', async () => {
    mockUseJellyfin.mockReturnValue(mockClient)
    mockClient.createUser.mockResolvedValue({ Id: 'jf-1' })

    await expect(provider.createUser({ username: 'bob', password: 'pw' })).resolves.toBe('jf-1')
    expect(mockClient.createUser).toHaveBeenCalledWith('bob', 'pw')
  })

  it('throws when jellyfin is not configured', async () => {
    mockUseJellyfin.mockReturnValue(null)

    await expect(provider.findUserByName('bob')).rejects.toThrow('Jellyfin is not configured')
  })

  it('findUserByName returns the id when the user exists', async () => {
    mockUseJellyfin.mockReturnValue(mockClient)
    mockClient.getUserByName.mockResolvedValue({ Id: 'jf-9' })

    await expect(provider.findUserByName('bob')).resolves.toBe('jf-9')
  })

  it('findUserByName returns null when the user is missing', async () => {
    mockUseJellyfin.mockReturnValue(mockClient)
    mockClient.getUserByName.mockResolvedValue(undefined)

    await expect(provider.findUserByName('bob')).resolves.toBeNull()
  })

  it('updateUser sends the renamed name', async () => {
    mockUseJellyfin.mockReturnValue(mockClient)

    await provider.updateUser('jf-1', { username: 'alice', password: 'pw' })

    expect(mockClient.updateUser).toHaveBeenCalledWith('jf-1', { Name: 'alice' })
  })

  it('updateUserSettings filters non-uuid folders and preserves existing policy', async () => {
    mockUseJellyfin.mockReturnValue(mockClient)
    mockClient.getUser.mockResolvedValue({ Policy: { IsAdministrator: true, AuthenticationProviderId: 'custom' } })

    await provider.updateUserSettings(
      'jf-1',
      settings({
        libraryAccess: ['11111111-1111-1111-1111-111111111111', 'not-a-uuid', '22222222-2222-2222-2222-222222222222']
      })
    )

    expect(mockClient.updateUserPolicy).toHaveBeenCalledWith(
      'jf-1',
      expect.objectContaining({
        EnabledFolders: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
        EnableAllFolders: false,
        IsAdministrator: true,
        AuthenticationProviderId: 'custom'
      })
    )
  })

  it('updateUserSettings enables all folders when libraryAccess is all', async () => {
    mockUseJellyfin.mockReturnValue(mockClient)
    mockClient.getUser.mockResolvedValue({ Policy: {} })

    await provider.updateUserSettings('jf-1', settings({ libraryAccess: 'all' }))

    expect(mockClient.updateUserPolicy).toHaveBeenCalledWith(
      'jf-1',
      expect.objectContaining({ EnableAllFolders: true, EnabledFolders: [] })
    )
  })

  it('getLibraries maps the client libraries', async () => {
    mockUseJellyfin.mockReturnValue(mockClient)
    mockClient.getLibraries.mockResolvedValue([{ Id: 'l1', Name: 'Movies', Path: '/movies' }])

    await expect(provider.getLibraries()).resolves.toEqual([{ id: 'l1', name: 'Movies', path: '/movies' }])
  })

  it('setAvatar delegates to setUserImage with a jpeg content type', async () => {
    mockUseJellyfin.mockReturnValue(mockClient)

    await provider.setAvatar('jf-1', Buffer.from([1, 2, 3]))

    expect(mockClient.setUserImage).toHaveBeenCalledWith('jf-1', Buffer.from([1, 2, 3]), 'image/jpeg')
  })
})
