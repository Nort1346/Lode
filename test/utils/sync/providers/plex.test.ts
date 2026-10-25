import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUsePlex = vi.hoisted(() => vi.fn())
const mockGetSetting = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/clients/plex', () => ({
  usePlex: mockUsePlex
}))

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

vi.mock('#server/types/settings', () => ({
  SETTINGS: {
    PLEX_SYNC_ENABLED: 'plex_sync_enabled',
    PLEX_DEFAULT_LIBRARY_ACCESS: 'plex_default_library_access',
    PLEX_DEFAULT_LIVE_TV_ACCESS: 'plex_default_live_tv_access',
    PLEX_DEFAULT_SYNC: 'plex_default_sync'
  }
}))

import { PlexSyncProvider } from '#server/utils/sync/providers/plex'
import type { SyncProvider, SyncUserSettings } from '#server/utils/sync/types'

const mockPms = {
  getSections: vi.fn(),
  getMachineIdentifier: vi.fn(),
  isItemInLibrary: vi.fn()
}

const mockTv = {
  createManagedUser: vi.fn(),
  getHomeUsers: vi.fn(),
  deleteHomeUser: vi.fn(),
  removeShare: vi.fn(),
  createShare: vi.fn()
}

function settings(over: Partial<SyncUserSettings> = {}): SyncUserSettings {
  return {
    libraryAccess: 'all',
    enableVideoTranscoding: false,
    enableAudioTranscoding: false,
    enableRemuxing: false,
    enableLiveTvAccess: false,
    enableLiveTvManagement: false,
    maxActiveSessions: 1,
    ...over
  }
}

function configured() {
  mockUsePlex.mockReturnValue({ pms: mockPms, tv: mockTv })
}

describe('PlexSyncProvider', () => {
  let provider: PlexSyncProvider

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSetting.mockResolvedValue(undefined)
    mockPms.getMachineIdentifier.mockResolvedValue('mid-1')
    provider = new PlexSyncProvider()
  })

  it('does not implement password or rename methods (plex.tv model)', () => {
    // View through the SyncProvider interface: updateUserPassword/updateUser are
    // optional there (D3), and the Plex class deliberately omits them.
    const asProvider: SyncProvider = provider
    expect(asProvider.updateUserPassword).toBeUndefined()
    expect(asProvider.updateUser).toBeUndefined()
  })

  it('isEnabled is false when the setting is disabled', async () => {
    mockGetSetting.mockResolvedValue('false')

    await expect(provider.isEnabled()).resolves.toBe(false)
    expect(mockUsePlex).not.toHaveBeenCalled()
  })

  it('isEnabled is true when enabled and a client exists', async () => {
    configured()
    await expect(provider.isEnabled()).resolves.toBe(true)
  })

  it('isEnabled is false when no client is configured', async () => {
    mockUsePlex.mockReturnValue(null)
    await expect(provider.isEnabled()).resolves.toBe(false)
  })

  it('throws when plex is not configured', async () => {
    mockUsePlex.mockReturnValue(null)
    await expect(provider.findUserByName('bob')).rejects.toThrow('Plex is not configured')
  })

  it('createUser creates a managed user and returns its id', async () => {
    configured()
    mockTv.createManagedUser.mockResolvedValue({ id: 77, title: 'bob' })

    await expect(provider.createUser({ username: 'bob', password: 'pw' })).resolves.toBe('77')
    expect(mockTv.createManagedUser).toHaveBeenCalledWith({ title: 'bob' })
    // The server share is applied separately by updateUserSettings.
    expect(mockTv.createShare).not.toHaveBeenCalled()
  })

  it('findUserByName matches on title (case-insensitive)', async () => {
    configured()
    mockTv.getHomeUsers.mockResolvedValue([
      { id: 1, title: 'Bob' },
      { id: 2, title: 'Alice' }
    ])

    await expect(provider.findUserByName('bob')).resolves.toBe('1')
  })

  it('findUserByName matches on username', async () => {
    configured()
    mockTv.getHomeUsers.mockResolvedValue([{ id: 5, username: 'Bobby' }])

    await expect(provider.findUserByName('bobby')).resolves.toBe('5')
  })

  it('findUserByName returns null when missing', async () => {
    configured()
    mockTv.getHomeUsers.mockResolvedValue([{ id: 5, title: 'Alice' }])

    await expect(provider.findUserByName('bob')).resolves.toBeNull()
  })

  it('updateUserSettings resolves "all" to every section key and applies a share', async () => {
    configured()
    mockPms.getSections.mockResolvedValue([
      { key: '1', type: 'movie', title: 'Movies' },
      { key: '2', type: 'show', title: 'TV' },
      { key: '3', type: 'artist', title: 'Music' }
    ])

    await provider.updateUserSettings('42', settings({ libraryAccess: 'all', enableLiveTvAccess: true }))

    expect(mockTv.removeShare).toHaveBeenCalledWith(42)
    expect(mockTv.createShare).toHaveBeenCalledWith('mid-1', 42, [1, 2, 3], { allowSync: true, allowTuners: true })
  })

  it('updateUserSettings maps an explicit section array', async () => {
    configured()

    await provider.updateUserSettings('42', settings({ libraryAccess: ['1', '2'], enableLiveTvAccess: false }))

    // No "all" -> sections are not fetched; ids parsed straight from the array.
    expect(mockPms.getSections).not.toHaveBeenCalled()
    expect(mockTv.createShare).toHaveBeenCalledWith('mid-1', 42, [1, 2], { allowSync: true, allowTuners: false })
  })

  it('passes allowSync=false when the global sync default is disabled', async () => {
    configured()
    // Only the PLEX_DEFAULT_SYNC key is "false"; every other setting keeps its default.
    mockGetSetting.mockImplementation(async (key: string) => (key === 'plex_default_sync' ? 'false' : undefined))
    mockPms.getSections.mockResolvedValue([{ key: '1', type: 'movie', title: 'Movies' }])

    await provider.updateUserSettings('42', settings({ libraryAccess: 'all', enableLiveTvAccess: true }))

    expect(mockTv.createShare).toHaveBeenCalledWith('mid-1', 42, [1], { allowSync: false, allowTuners: true })
  })

  it('passes allowTuners=false when live TV access is revoked', async () => {
    configured()
    mockPms.getSections.mockResolvedValue([{ key: '1', type: 'movie', title: 'Movies' }])

    await provider.updateUserSettings('42', settings({ libraryAccess: 'all', enableLiveTvAccess: false }))

    expect(mockTv.createShare).toHaveBeenCalledWith('mid-1', 42, [1], { allowSync: true, allowTuners: false })
  })

  it('still creates the share when there is no prior share to remove', async () => {
    configured()
    mockTv.removeShare.mockRejectedValueOnce(new Error('404 no share'))
    mockPms.getSections.mockResolvedValue([])

    await provider.updateUserSettings('42', settings({ libraryAccess: 'all' }))

    expect(mockTv.createShare).toHaveBeenCalled()
  })

  it('deleteUser removes the share then the home user', async () => {
    configured()

    await provider.deleteUser('42')

    expect(mockTv.removeShare).toHaveBeenCalledWith(42)
    expect(mockTv.deleteHomeUser).toHaveBeenCalledWith(42)
  })

  it('deleteUser still deletes the home user when share removal fails', async () => {
    configured()
    mockTv.removeShare.mockRejectedValueOnce(new Error('network'))

    await provider.deleteUser('42')

    expect(mockTv.deleteHomeUser).toHaveBeenCalledWith(42)
  })

  it('disableUser removes the share', async () => {
    configured()

    await provider.disableUser('42')

    expect(mockTv.removeShare).toHaveBeenCalledWith(42)
  })

  it('disableUser does not throw when share removal fails (is_active gates access)', async () => {
    configured()
    mockTv.removeShare.mockRejectedValueOnce(new Error('gone'))

    await expect(provider.disableUser('42')).resolves.toBeUndefined()
  })

  it('enableUser re-applies a share with default access', async () => {
    configured()
    mockPms.getSections.mockResolvedValue([{ key: '1', type: 'movie', title: 'Movies' }])

    await provider.enableUser('42')

    expect(mockTv.createShare).toHaveBeenCalledWith('mid-1', 42, [1], { allowSync: true, allowTuners: true })
  })

  it('getLibraries maps sections (missing path -> empty)', async () => {
    configured()
    mockPms.getSections.mockResolvedValue([
      { key: '1', type: 'movie', title: 'Movies', Location: [{ path: '/media/Movies' }] },
      { key: '2', type: 'show', title: 'TV' }
    ])

    await expect(provider.getLibraries()).resolves.toEqual([
      { id: '1', name: 'Movies', path: '/media/Movies' },
      { id: '2', name: 'TV', path: '' }
    ])
  })

  it('isItemInLibrary delegates to the PMS client', async () => {
    configured()
    mockPms.isItemInLibrary.mockResolvedValue(true)

    await expect(provider.isItemInLibrary(812)).resolves.toBe(true)
    expect(mockPms.isItemInLibrary).toHaveBeenCalledWith(812)
  })

  it('avatar methods are no-ops and never touch the client', async () => {
    await expect(provider.setAvatar('1', Buffer.from('x'))).resolves.toBeUndefined()
    await expect(provider.deleteAvatar('1')).resolves.toBeUndefined()
    expect(mockUsePlex).not.toHaveBeenCalled()
  })
})
