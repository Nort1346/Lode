import { describe, it, expect, vi, beforeEach } from 'vitest'

const providerMocks = vi.hoisted(() => ({
  isEnabled: vi.fn(),
  findUserByName: vi.fn(),
  createUser: vi.fn(),
  updateUserPassword: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  disableUser: vi.fn(),
  enableUser: vi.fn(),
  updateUserSettings: vi.fn(),
  setAvatar: vi.fn(),
  deleteAvatar: vi.fn()
}))

vi.mock('#server/utils/sync/providers/jellyfin', () => ({
  JellyfinSyncProvider: class {
    name = 'jellyfin'
    isEnabled = providerMocks.isEnabled
    findUserByName = providerMocks.findUserByName
    createUser = providerMocks.createUser
    updateUserPassword = providerMocks.updateUserPassword
    updateUser = providerMocks.updateUser
    deleteUser = providerMocks.deleteUser
    disableUser = providerMocks.disableUser
    enableUser = providerMocks.enableUser
    updateUserSettings = providerMocks.updateUserSettings
    setAvatar = providerMocks.setAvatar
    deleteAvatar = providerMocks.deleteAvatar
  }
}))

// The plex mock intentionally omits updateUserPassword / updateUser to mirror the
// real PlexSyncProvider (invite-based: no API-settable password). This lets the
// two-provider scenarios exercise the D3 guard in the orchestrator.
const plexProviderMocks = vi.hoisted(() => ({
  isEnabled: vi.fn(),
  findUserByName: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  disableUser: vi.fn(),
  enableUser: vi.fn(),
  updateUserSettings: vi.fn(),
  setAvatar: vi.fn(),
  deleteAvatar: vi.fn()
}))

vi.mock('#server/utils/sync/providers/plex', () => ({
  PlexSyncProvider: class {
    name = 'plex'
    isEnabled = plexProviderMocks.isEnabled
    findUserByName = plexProviderMocks.findUserByName
    createUser = plexProviderMocks.createUser
    deleteUser = plexProviderMocks.deleteUser
    disableUser = plexProviderMocks.disableUser
    enableUser = plexProviderMocks.enableUser
    updateUserSettings = plexProviderMocks.updateUserSettings
    setAvatar = plexProviderMocks.setAvatar
    deleteAvatar = plexProviderMocks.deleteAvatar
  }
}))

const mockGetSetting = vi.hoisted(() => vi.fn((_key?: string) => undefined as string | undefined))
vi.mock('#server/utils/settings', () => ({ getSetting: mockGetSetting }))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn((first: unknown) => first)
}))

vi.mock('#server/database/schema', () => ({
  syncProviders: {
    id: 'id',
    userId: 'userId',
    providerName: 'providerName',
    providerUserId: 'providerUserId',
    syncStatus: 'syncStatus',
    lastSyncError: 'lastSyncError'
  },
  syncUserSettings: { id: 'id', userId: 'userId', providerName: 'providerName', libraryAccess: 'libraryAccess' }
}))

import {
  getDefaultSyncSettings,
  getSyncUserSettings,
  upsertSyncUserSettings,
  getProviderUserId,
  getUserSyncStatuses,
  syncNewUser,
  syncUserCreate,
  syncUserUpdate,
  syncUserDelete,
  syncUserDisable,
  syncUserEnable,
  syncAvatar,
  syncAvatarDelete
} from '#server/utils/sync'
import { syncUserSettings } from '#server/database/schema'

interface DbState {
  settingsRow?: unknown
  providerRow?: unknown
  providerRows?: unknown[]
}

function makeDb(state: DbState = {}) {
  const runMock = vi.fn(() => ({ changes: 1 }))
  const updateMock = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ run: runMock })) })) }))
  const deleteMock = vi.fn(() => ({ where: vi.fn(() => ({ run: runMock })) }))
  const db = {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({
          get: vi.fn(() => (table === syncUserSettings ? state.settingsRow : state.providerRow)),
          all: vi.fn(() => (table === syncUserSettings ? [] : (state.providerRows ?? [])))
        }))
      }))
    })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ run: runMock })) })),
    update: updateMock,
    delete: deleteMock
  }
  return { db, runMock, updateMock, deleteMock }
}

let current: ReturnType<typeof makeDb>

vi.stubGlobal('useDb', () => current.db)

const settings = {
  libraryAccess: 'all' as string[] | 'all',
  enableVideoTranscoding: true,
  enableAudioTranscoding: true,
  enableRemuxing: true,
  enableLiveTvAccess: true,
  enableLiveTvManagement: false,
  maxActiveSessions: 0
}

beforeEach(() => {
  vi.clearAllMocks()
  current = makeDb()
  mockGetSetting.mockReset()
  mockGetSetting.mockReturnValue(undefined)
  providerMocks.isEnabled.mockReset()
  providerMocks.isEnabled.mockResolvedValue(true)
  providerMocks.findUserByName.mockReset()
  providerMocks.findUserByName.mockResolvedValue(null)
  providerMocks.createUser.mockReset()
  providerMocks.createUser.mockResolvedValue('jf-new')
  for (const key of [
    'updateUserPassword',
    'updateUser',
    'deleteUser',
    'disableUser',
    'enableUser',
    'updateUserSettings',
    'setAvatar',
    'deleteAvatar'
  ] as const) {
    providerMocks[key].mockReset()
    providerMocks[key].mockResolvedValue(undefined)
  }
  // Plex is disabled by default so the existing jellyfin-only scenarios (which
  // assume a single active provider) stay unchanged.
  plexProviderMocks.isEnabled.mockReset()
  plexProviderMocks.isEnabled.mockResolvedValue(false)
  for (const key of [
    'findUserByName',
    'createUser',
    'deleteUser',
    'disableUser',
    'enableUser',
    'updateUserSettings',
    'setAvatar',
    'deleteAvatar'
  ] as const) {
    plexProviderMocks[key].mockReset()
    plexProviderMocks[key].mockResolvedValue(undefined)
  }
  plexProviderMocks.findUserByName.mockResolvedValue(null)
  plexProviderMocks.createUser.mockResolvedValue('px-new')
})

describe('getDefaultSyncSettings', () => {
  it('builds settings from the jellyfin default settings', async () => {
    mockGetSetting.mockImplementation((key: string | undefined) =>
      key === 'jellyfin_default_library_access'
        ? '["lib1"]'
        : key === 'jellyfin_default_max_active_sessions'
          ? '3'
          : 'false'
    )

    const result = await getDefaultSyncSettings()

    expect(result.libraryAccess).toEqual(['lib1'])
    expect(result.enableVideoTranscoding).toBe(false)
    expect(result.enableLiveTvManagement).toBe(false)
    expect(result.maxActiveSessions).toBe(3)
  })

  it('prefers explicit overrides over the stored defaults', async () => {
    const result = await getDefaultSyncSettings({ libraryAccess: ['x'], maxActiveSessions: 9 })

    expect(result.libraryAccess).toEqual(['x'])
    expect(result.maxActiveSessions).toBe(9)
    expect(result.enableVideoTranscoding).toBe(true)
  })
})

describe('getSyncUserSettings', () => {
  it('returns the stored row when present', async () => {
    current = makeDb({
      settingsRow: {
        libraryAccess: '["a", "b"]',
        enableVideoTranscoding: true,
        enableAudioTranscoding: false,
        enableRemuxing: true,
        enableLiveTvAccess: true,
        enableLiveTvManagement: false,
        maxActiveSessions: 2
      }
    })

    const result = await getSyncUserSettings('u1', 'jellyfin')

    expect(result.libraryAccess).toEqual(['a', 'b'])
    expect(result.enableAudioTranscoding).toBe(false)
    expect(result.maxActiveSessions).toBe(2)
  })

  it('falls back to the defaults when no row exists', async () => {
    const result = await getSyncUserSettings('u1', 'jellyfin')

    expect(result).toEqual(settings)
  })
})

describe('upsertSyncUserSettings', () => {
  it('updates the existing row', async () => {
    current = makeDb({ settingsRow: { id: 's1' } })

    await upsertSyncUserSettings('u1', 'jellyfin', settings)

    expect(current.updateMock).toHaveBeenCalled()
    expect(current.db.insert).not.toHaveBeenCalled()
  })

  it('inserts a new row when none exists', async () => {
    await upsertSyncUserSettings('u1', 'jellyfin', settings)

    expect(current.db.insert).toHaveBeenCalled()
    expect(current.runMock).toHaveBeenCalled()
  })
})

describe('getProviderUserId', () => {
  it('returns the mapped provider user id', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })

    await expect(getProviderUserId('u1', 'jellyfin')).resolves.toBe('jf1')
  })

  it('returns null when no mapping exists', async () => {
    await expect(getProviderUserId('u1', 'jellyfin')).resolves.toBeNull()
  })
})

describe('getUserSyncStatuses', () => {
  it('maps every provider row', async () => {
    current = makeDb({
      providerRows: [
        {
          providerName: 'jellyfin',
          providerUserId: 'jf1',
          syncStatus: 'synced',
          lastSyncError: null
        }
      ]
    })

    await expect(getUserSyncStatuses('u1')).resolves.toEqual([
      { providerName: 'jellyfin', providerUserId: 'jf1', syncStatus: 'synced', lastSyncError: null }
    ])
  })
})

describe('syncNewUser', () => {
  it('returns synced when the provider user is created', async () => {
    const result = await syncNewUser('u1', { username: 'bob', password: 'pw' }, settings)

    expect(result).toBe('synced')
    expect(providerMocks.createUser).toHaveBeenCalledWith({ username: 'bob', password: 'pw' })
    expect(current.runMock).toHaveBeenCalled()
  })

  it('returns failed when provider detection throws', async () => {
    providerMocks.isEnabled.mockRejectedValueOnce(new Error('jellyfin down'))

    await expect(syncNewUser('u1', { username: 'bob', password: 'pw' }, settings)).resolves.toBe('failed')
  })
})

describe('syncUserCreate', () => {
  it('does nothing when no providers are enabled', async () => {
    providerMocks.isEnabled.mockResolvedValue(false)

    await syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)

    expect(providerMocks.findUserByName).not.toHaveBeenCalled()
    expect(current.runMock).not.toHaveBeenCalled()
  })

  it('updates the existing mapping instead of creating a new user', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })

    await syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)

    expect(providerMocks.createUser).not.toHaveBeenCalled()
    expect(providerMocks.updateUserPassword).toHaveBeenCalledWith('jf1', 'pw')
    expect(providerMocks.updateUserSettings).toHaveBeenCalledWith('jf1', settings)
  })

  it('skips creation when the user is not found and no password is provided', async () => {
    await syncUserCreate('u1', { username: 'bob', password: '' }, settings)

    expect(providerMocks.createUser).not.toHaveBeenCalled()
    expect(current.runMock).not.toHaveBeenCalled()
  })

  it('creates the user, stores the mapping and applies the settings', async () => {
    await syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)

    expect(providerMocks.createUser).toHaveBeenCalledWith({ username: 'bob', password: 'pw' })
    expect(current.runMock).toHaveBeenCalled()
    expect(providerMocks.updateUserSettings).toHaveBeenCalledWith('jf-new', settings)
  })

  it('reuses a provider user found by name and syncs its password', async () => {
    providerMocks.findUserByName.mockResolvedValue('jf-ex')

    await syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)

    expect(providerMocks.createUser).not.toHaveBeenCalled()
    expect(providerMocks.updateUserPassword).toHaveBeenCalledWith('jf-ex', 'pw')
    expect(current.runMock).toHaveBeenCalled()
  })

  it('stores the mapping even when the password sync of a found user fails', async () => {
    providerMocks.findUserByName.mockResolvedValue('jf-ex')
    providerMocks.updateUserPassword.mockRejectedValueOnce(new Error('denied'))

    await syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)

    expect(current.runMock).toHaveBeenCalled()
  })

  it('records a failed sync status when the provider create throws', async () => {
    providerMocks.createUser.mockRejectedValueOnce(new Error('boom'))

    await expect(syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)).resolves.toBeUndefined()

    expect(current.updateMock).toHaveBeenCalled()
  })

  it('records a failed sync status when applying settings throws', async () => {
    providerMocks.updateUserSettings.mockRejectedValueOnce(new Error('policy rejected'))

    await syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)

    expect(current.updateMock).toHaveBeenCalled()
  })
})

describe('syncUserUpdate', () => {
  it('updates password and settings for a mapped user', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })

    await syncUserUpdate('u1', { username: 'bob', password: 'pw' }, settings)

    expect(providerMocks.updateUserPassword).toHaveBeenCalledWith('jf1', 'pw')
    expect(providerMocks.updateUserSettings).toHaveBeenCalledWith('jf1', settings)
    expect(current.updateMock).toHaveBeenCalled()
  })

  it('skips the password update when no password is provided', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })

    await syncUserUpdate('u1', { username: 'bob', password: '' }, settings)

    expect(providerMocks.updateUserPassword).not.toHaveBeenCalled()
    expect(providerMocks.updateUserSettings).toHaveBeenCalled()
  })

  it('attempts a retroactive create when no mapping exists yet', async () => {
    await syncUserUpdate('u1', { username: 'bob', password: 'pw' }, settings)

    expect(providerMocks.findUserByName).toHaveBeenCalled()
    expect(providerMocks.createUser).toHaveBeenCalled()
  })

  it('records a failed sync status when the provider update throws', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })
    providerMocks.updateUserSettings.mockRejectedValueOnce(new Error('broken'))

    await syncUserUpdate('u1', { username: 'bob', password: 'pw' }, settings)

    expect(current.updateMock).toHaveBeenCalled()
  })
})

describe('syncUserDelete', () => {
  it('deletes the provider user and removes the local rows', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })

    await syncUserDelete('u1')

    expect(providerMocks.deleteUser).toHaveBeenCalledWith('jf1')
    expect(current.deleteMock).toHaveBeenCalledTimes(2)
  })

  it('skips the provider call when no mapping exists but still cleans up', async () => {
    await syncUserDelete('u1')

    expect(providerMocks.deleteUser).not.toHaveBeenCalled()
    expect(current.deleteMock).toHaveBeenCalledTimes(2)
  })

  it('still removes the local rows when the provider delete fails', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })
    providerMocks.deleteUser.mockRejectedValueOnce(new Error('gone'))

    await expect(syncUserDelete('u1')).resolves.toBeUndefined()

    expect(current.deleteMock).toHaveBeenCalledTimes(2)
  })
})

describe('syncUserDisable / syncUserEnable', () => {
  it('disables the provider user and marks the sync as synced', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })

    await syncUserDisable('u1')

    expect(providerMocks.disableUser).toHaveBeenCalledWith('jf1')
    expect(current.updateMock).toHaveBeenCalled()
  })

  it('enables the provider user and marks the sync as synced', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })

    await syncUserEnable('u1')

    expect(providerMocks.enableUser).toHaveBeenCalledWith('jf1')
    expect(current.updateMock).toHaveBeenCalled()
  })

  it('records a failed sync status when disabling throws', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })
    providerMocks.disableUser.mockRejectedValueOnce(new Error('nope'))

    await syncUserDisable('u1')

    expect(current.updateMock).toHaveBeenCalled()
  })

  it('records a failed sync status when enabling throws', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })
    providerMocks.enableUser.mockRejectedValueOnce(new Error('nope'))

    await syncUserEnable('u1')

    expect(current.updateMock).toHaveBeenCalled()
  })

  it('skips when no mapping exists', async () => {
    await syncUserDisable('u1')
    await syncUserEnable('u1')

    expect(providerMocks.disableUser).not.toHaveBeenCalled()
    expect(providerMocks.enableUser).not.toHaveBeenCalled()
  })
})

describe('syncAvatar / syncAvatarDelete', () => {
  it('pushes the avatar to the provider', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })
    const buffer = Buffer.from('img')

    await syncAvatar('u1', buffer)

    expect(providerMocks.setAvatar).toHaveBeenCalledWith('jf1', buffer)
  })

  it('swallows provider errors when pushing the avatar', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })
    providerMocks.setAvatar.mockRejectedValueOnce(new Error('nope'))

    await expect(syncAvatar('u1', Buffer.from('img'))).resolves.toBeUndefined()
  })

  it('deletes the avatar on the provider', async () => {
    current = makeDb({ providerRow: { providerUserId: 'jf1' } })

    await syncAvatarDelete('u1')

    expect(providerMocks.deleteAvatar).toHaveBeenCalledWith('jf1')
  })

  it('skips when no mapping exists', async () => {
    await syncAvatar('u1', Buffer.from('img'))
    await syncAvatarDelete('u1')

    expect(providerMocks.setAvatar).not.toHaveBeenCalled()
    expect(providerMocks.deleteAvatar).not.toHaveBeenCalled()
  })
})

describe('two active providers (jellyfin + plex)', () => {
  beforeEach(() => {
    providerMocks.isEnabled.mockResolvedValue(true)
    plexProviderMocks.isEnabled.mockResolvedValue(true)
  })

  it('syncNewUser creates a user on both providers', async () => {
    const result = await syncNewUser('u1', { username: 'bob', password: 'pw' }, settings)

    expect(result).toBe('synced')
    expect(providerMocks.createUser).toHaveBeenCalledWith({ username: 'bob', password: 'pw' })
    expect(plexProviderMocks.createUser).toHaveBeenCalledWith({ username: 'bob', password: 'pw' })
  })

  it('applies settings to both providers on create', async () => {
    await syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)

    expect(providerMocks.updateUserSettings).toHaveBeenCalledWith('jf-new', settings)
    expect(plexProviderMocks.updateUserSettings).toHaveBeenCalledWith('px-new', settings)
  })

  it('routes the password only to jellyfin (plex has no updateUserPassword)', async () => {
    providerMocks.findUserByName.mockResolvedValue('jf-ex')
    plexProviderMocks.findUserByName.mockResolvedValue('px-ex')

    await syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)

    // jellyfin implements updateUserPassword -> called; plex does not -> skipped,
    // but its settings still apply.
    expect(providerMocks.updateUserPassword).toHaveBeenCalledWith('jf-ex', 'pw')
    expect(plexProviderMocks.createUser).not.toHaveBeenCalled()
    expect(plexProviderMocks.updateUserSettings).toHaveBeenCalledWith('px-ex', settings)
  })

  // NOTE: makeDb's `.get()` cannot route by provider name (the loose drizzle mock
  // discards the WHERE clause), so both providers resolve to the SAME
  // providerUserId via the singular `providerRow`. That is intentional: these
  // tests verify the LOOP reaches each provider and that the D3 guard skips
  // plex's missing updateUserPassword - not that the DB stores distinct ids.
  it('on update, sets the password on jellyfin but not plex, and updates settings on both', async () => {
    current = makeDb({ providerRow: { providerUserId: 'x1' } })

    await syncUserUpdate('u1', { username: 'bob', password: 'pw' }, settings)

    expect(providerMocks.updateUserPassword).toHaveBeenCalledWith('x1', 'pw')
    expect(providerMocks.updateUserSettings).toHaveBeenCalledWith('x1', settings)
    // plex mock has no updateUserPassword -> the D3 guard skips it, settings still run
    expect(plexProviderMocks.updateUserSettings).toHaveBeenCalledWith('x1', settings)
  })

  it('deletes the user on both providers and cleans local rows once', async () => {
    current = makeDb({ providerRow: { providerUserId: 'x1' } })

    await syncUserDelete('u1')

    expect(providerMocks.deleteUser).toHaveBeenCalledWith('x1')
    expect(plexProviderMocks.deleteUser).toHaveBeenCalledWith('x1')
    // local cleanup runs once regardless of provider count
    expect(current.deleteMock).toHaveBeenCalledTimes(2)
  })

  it('disables on both providers', async () => {
    current = makeDb({ providerRow: { providerUserId: 'x1' } })

    await syncUserDisable('u1')

    expect(providerMocks.disableUser).toHaveBeenCalledWith('x1')
    expect(plexProviderMocks.disableUser).toHaveBeenCalledWith('x1')
  })

  it('enables on both providers', async () => {
    current = makeDb({ providerRow: { providerUserId: 'x1' } })

    await syncUserEnable('u1')

    expect(providerMocks.enableUser).toHaveBeenCalledWith('x1')
    expect(plexProviderMocks.enableUser).toHaveBeenCalledWith('x1')
  })

  it('pushes the avatar to both providers', async () => {
    current = makeDb({ providerRow: { providerUserId: 'x1' } })
    const buffer = Buffer.from('img')

    await syncAvatar('u1', buffer)

    expect(providerMocks.setAvatar).toHaveBeenCalledWith('x1', buffer)
    expect(plexProviderMocks.setAvatar).toHaveBeenCalledWith('x1', buffer)
  })

  it('getUserSyncStatuses returns a status for each provider', async () => {
    current = makeDb({
      providerRows: [
        { providerName: 'jellyfin', providerUserId: 'jf1', syncStatus: 'synced', lastSyncError: null },
        { providerName: 'plex', providerUserId: 'px1', syncStatus: 'synced', lastSyncError: null }
      ]
    })

    await expect(getUserSyncStatuses('u1')).resolves.toEqual([
      { providerName: 'jellyfin', providerUserId: 'jf1', syncStatus: 'synced', lastSyncError: null },
      { providerName: 'plex', providerUserId: 'px1', syncStatus: 'synced', lastSyncError: null }
    ])
  })
})

describe('provider matrix: plex-only', () => {
  beforeEach(() => {
    providerMocks.isEnabled.mockResolvedValue(false)
    plexProviderMocks.isEnabled.mockResolvedValue(true)
  })

  it('syncNewUser creates the user on plex and not jellyfin', async () => {
    const result = await syncNewUser('u1', { username: 'bob', password: 'pw' }, settings)

    expect(result).toBe('synced')
    expect(plexProviderMocks.createUser).toHaveBeenCalledWith({ username: 'bob', password: 'pw' })
    expect(providerMocks.createUser).not.toHaveBeenCalled()
  })

  it('skips the password path (plex has no updateUserPassword) and still applies settings', async () => {
    await syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)

    // plex mock has no updateUserPassword -> guard skips it; createUser still runs.
    expect(plexProviderMocks.createUser).toHaveBeenCalledWith({ username: 'bob', password: 'pw' })
    expect(plexProviderMocks.updateUserSettings).toHaveBeenCalledWith('px-new', settings)
  })

  it('syncUserCreate does nothing when plex is disabled', async () => {
    plexProviderMocks.isEnabled.mockResolvedValue(false)

    await syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)

    expect(plexProviderMocks.findUserByName).not.toHaveBeenCalled()
    expect(plexProviderMocks.createUser).not.toHaveBeenCalled()
  })
})

describe('provider matrix: both active, one failing', () => {
  beforeEach(() => {
    providerMocks.isEnabled.mockResolvedValue(true)
    plexProviderMocks.isEnabled.mockResolvedValue(true)
  })

  it('a jellyfin create failure does not stop plex from succeeding', async () => {
    providerMocks.createUser.mockRejectedValueOnce(new Error('jellyfin down'))

    await syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)

    // plex still created its user and applied settings despite jellyfin failing.
    expect(plexProviderMocks.createUser).toHaveBeenCalledWith({ username: 'bob', password: 'pw' })
    expect(plexProviderMocks.updateUserSettings).toHaveBeenCalledWith('px-new', settings)
  })

  it('a plex create failure does not stop jellyfin from succeeding', async () => {
    plexProviderMocks.createUser.mockRejectedValueOnce(new Error('plex down'))

    await syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)

    expect(providerMocks.createUser).toHaveBeenCalledWith({ username: 'bob', password: 'pw' })
    expect(providerMocks.updateUserSettings).toHaveBeenCalledWith('jf-new', settings)
  })

  it('syncNewUser stays synced even when every provider create fails (failures become per-provider status)', async () => {
    providerMocks.createUser.mockRejectedValueOnce(new Error('jf down'))
    plexProviderMocks.createUser.mockRejectedValueOnce(new Error('px down'))

    // syncUserCreate swallows per-provider errors into status rows rather than
    // rethrowing, so the overall call still resolves. The per-provider truth is
    // the status write (updateSyncStatus -> updateMock), not the return value.
    await expect(syncNewUser('u1', { username: 'bob', password: 'pw' }, settings)).resolves.toBe('synced')
    expect(current.updateMock).toHaveBeenCalled()
  })

  it('syncNewUser stays synced when only one of two providers throws', async () => {
    plexProviderMocks.createUser.mockRejectedValueOnce(new Error('px down'))

    await expect(syncNewUser('u1', { username: 'bob', password: 'pw' }, settings)).resolves.toBe('synced')
  })

  it('records a failed status for the failing provider but the other still maps', async () => {
    plexProviderMocks.updateUserSettings.mockRejectedValueOnce(new Error('share rejected'))

    await syncUserCreate('u1', { username: 'bob', password: 'pw' }, settings)

    // both providers attempted createUser; the failing one flips status to failed,
    // the healthy one stays synced. updateMock is hit for the failed status write.
    expect(providerMocks.createUser).toHaveBeenCalled()
    expect(plexProviderMocks.createUser).toHaveBeenCalled()
    expect(current.updateMock).toHaveBeenCalled()
  })
})
