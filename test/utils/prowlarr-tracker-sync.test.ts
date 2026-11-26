import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const customTrackers = {
    findByIndexerName: vi.fn(),
    update: vi.fn(),
    create: vi.fn()
  }

  return {
    customTrackers,
    getReposAsync: vi.fn(async () => ({ customTrackers })),
    encryptAES: vi.fn((value: string) => `enc:${value}`)
  }
})

vi.mock('#server/repositories', () => ({
  getReposAsync: mocks.getReposAsync
}))

vi.mock('#server/utils/crypto', () => ({
  encryptAES: mocks.encryptAES
}))

import { assertIndexerTrackerLink, syncIndexerTracker, toIndexerTrackerView } from '#server/utils/prowlarr-tracker-sync'
import type { CustomTracker } from '#server/types/entities'

function tracker(overrides: Partial<CustomTracker> = {}): CustomTracker {
  return {
    id: 'tracker-1',
    indexerName: 'Tracker',
    trackerType: 'guid',
    cookie: '',
    loginUrl: 'https://tracker.test/login',
    loginUsername: 'user',
    loginPassword: 'enc:old',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('prowlarr-tracker-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.customTrackers.findByIndexerName.mockReset()
    mocks.customTrackers.update.mockReset()
    mocks.customTrackers.create.mockReset()
    mocks.encryptAES.mockReset()
    mocks.encryptAES.mockImplementation((value: string) => `enc:${value}`)
    mocks.customTrackers.findByIndexerName.mockResolvedValue(undefined)
    mocks.customTrackers.update.mockResolvedValue(undefined)
    mocks.customTrackers.create.mockResolvedValue(undefined)
  })

  it('creates a counting tracker entry', async () => {
    const result = await syncIndexerTracker('MyTracker', undefined, {
      enabled: true,
      trackerType: 'counting'
    })

    expect(result.action).toBe('created')
    expect(result.trackerId).toEqual(expect.any(String))
    expect(mocks.customTrackers.create).toHaveBeenCalledWith({
      id: expect.any(String),
      indexerName: 'MyTracker',
      trackerType: 'counting',
      cookie: '',
      loginUrl: null,
      loginUsername: null,
      loginPassword: null,
      enabled: true,
      createdAt: expect.any(String)
    })
  })

  it('creates a GUID tracker with a cookie', async () => {
    await syncIndexerTracker('MyTracker', undefined, {
      enabled: true,
      trackerType: 'guid',
      cookie: ' session-cookie '
    })

    expect(mocks.customTrackers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trackerType: 'guid',
        cookie: 'session-cookie',
        loginUrl: null,
        loginUsername: null,
        loginPassword: null
      })
    )
  })

  it('encrypts login credentials for a new GUID tracker', async () => {
    await syncIndexerTracker('MyTracker', undefined, {
      enabled: true,
      trackerType: 'guid',
      loginUrl: 'https://tracker.test/login',
      loginUsername: 'user',
      loginPassword: 'secret'
    })

    expect(mocks.encryptAES).toHaveBeenCalledWith('secret')
    expect(mocks.customTrackers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        loginUrl: 'https://tracker.test/login',
        loginUsername: 'user',
        loginPassword: 'enc:secret'
      })
    )
  })

  it('keeps the stored password when the field is left empty', async () => {
    const existing = tracker()
    mocks.customTrackers.findByIndexerName.mockResolvedValue(existing)

    const result = await syncIndexerTracker('Tracker', undefined, {
      enabled: true,
      trackerType: 'guid',
      loginUrl: 'https://tracker.test/login',
      loginUsername: 'user',
      loginPassword: ''
    })

    expect(result.action).toBe('updated')
    expect(mocks.customTrackers.update).toHaveBeenCalledWith(
      'tracker-1',
      expect.objectContaining({ loginPassword: 'enc:old' })
    )
  })

  it('renames the existing tracker when the indexer name changes', async () => {
    mocks.customTrackers.findByIndexerName.mockImplementation(async (name: string) =>
      name === 'Old tracker' ? tracker({ indexerName: 'Old tracker' }) : undefined
    )

    const result = await syncIndexerTracker('New tracker', 'Old tracker', {
      enabled: false,
      trackerType: 'counting'
    })

    expect(result.action).toBe('renamed')
    expect(mocks.customTrackers.update).toHaveBeenCalledWith('tracker-1', { indexerName: 'New tracker' })
    expect(mocks.customTrackers.create).not.toHaveBeenCalled()
  })

  it('does nothing when the tracker link is disabled', async () => {
    const result = await syncIndexerTracker('MyTracker', undefined, null)

    expect(result).toEqual({ action: 'none', trackerId: null })
    expect(mocks.customTrackers.create).not.toHaveBeenCalled()
    expect(mocks.customTrackers.update).not.toHaveBeenCalled()
  })

  it('rejects a GUID tracker without credentials', async () => {
    await expect(
      assertIndexerTrackerLink('MyTracker', undefined, {
        enabled: true,
        trackerType: 'guid'
      })
    ).rejects.toThrow('400:')
  })

  it('rejects a tracker with both cookie and login credentials', async () => {
    await expect(
      assertIndexerTrackerLink('MyTracker', undefined, {
        enabled: true,
        trackerType: 'guid',
        cookie: 'cookie',
        loginUrl: 'https://tracker.test/login',
        loginUsername: 'user',
        loginPassword: 'secret'
      })
    ).rejects.toThrow('400:')
  })

  it('rejects a rename that collides with another tracker', async () => {
    mocks.customTrackers.findByIndexerName.mockImplementation(async (name: string) => {
      if (name === 'New tracker') return tracker({ id: 'tracker-2', indexerName: 'New tracker' })
      return tracker({ id: 'tracker-1', indexerName: 'Old tracker' })
    })

    await expect(
      assertIndexerTrackerLink('New tracker', 'Old tracker', {
        enabled: true,
        trackerType: 'counting'
      })
    ).rejects.toThrow('409:')
  })

  it('maps tracker views without exposing the password', () => {
    const view = toIndexerTrackerView(tracker())

    expect(view.hasPassword).toBe(true)
    expect('loginPassword' in view).toBe(false)
    expect(view.indexerName).toBe('Tracker')
  })
})
