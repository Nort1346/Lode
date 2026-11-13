import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mocks = vi.hoisted(() => ({
  client: {
    createIndexer: vi.fn(),
    deleteIndexer: vi.fn()
  },
  assertIndexerTrackerLink: vi.fn(),
  syncIndexerTracker: vi.fn(),
  readBody: vi.fn()
}))

vi.mock('#server/utils/prowlarr-admin', async () => {
  const actual = await vi.importActual<typeof import('#server/utils/prowlarr-admin')>('#server/utils/prowlarr-admin')
  return {
    ...actual,
    requireProwlarrAdminClient: () => mocks.client
  }
})

vi.mock('#server/utils/prowlarr-tracker-sync', () => ({
  assertIndexerTrackerLink: mocks.assertIndexerTrackerLink,
  syncIndexerTracker: mocks.syncIndexerTracker
}))

import handler from '#server/api/admin/indexers/index.post'

const mockGetUserSession = vi.fn()

function payload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'My Tracker',
    enable: true,
    priority: 25,
    appProfileId: 1,
    tags: [],
    definitionName: 'mytracker',
    implementation: 'Cardigann',
    implementationName: 'Cardigann',
    configContract: 'CardigannSettings',
    protocol: 'torrent',
    privacy: 'private',
    fields: [{ name: 'baseUrl', value: 'https://tracker.test/' }],
    ...overrides
  }
}

describe('admin/indexers/index.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', username: 'admin', role: 'admin' } })
    vi.stubGlobal('readBody', mocks.readBody)
    mocks.readBody.mockReset()
    mocks.client.createIndexer.mockReset()
    mocks.client.deleteIndexer.mockReset()
    mocks.assertIndexerTrackerLink.mockReset()
    mocks.syncIndexerTracker.mockReset()
    mocks.readBody.mockResolvedValue({ indexer: payload() })
    mocks.assertIndexerTrackerLink.mockResolvedValue(undefined)
    mocks.syncIndexerTracker.mockResolvedValue({ action: 'created', trackerId: 'tracker-1' })
    mocks.client.createIndexer.mockResolvedValue({
      id: 12,
      name: 'My Tracker',
      privacy: 'private'
    })
  })

  const mockEvent = {} as never

  it('creates an indexer and syncs the tracker entry', async () => {
    const result = await handler(mockEvent)

    expect(result).toEqual({ success: true, id: 12 })
    expect(mocks.assertIndexerTrackerLink).toHaveBeenCalledWith('My Tracker', undefined, undefined)
    expect(mocks.client.createIndexer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My Tracker',
        enable: true,
        priority: 25,
        appProfileId: 1,
        definitionName: 'mytracker'
      })
    )
    expect(mocks.syncIndexerTracker).toHaveBeenCalledWith('My Tracker', undefined, undefined)
  })

  it('passes the tracker link through to validation and sync', async () => {
    const tracker = { enabled: true, trackerType: 'counting' }
    mocks.readBody.mockResolvedValue({ indexer: payload(), tracker })

    await handler(mockEvent)

    expect(mocks.assertIndexerTrackerLink).toHaveBeenCalledWith('My Tracker', undefined, tracker)
    expect(mocks.syncIndexerTracker).toHaveBeenCalledWith('My Tracker', undefined, tracker)
  })

  it('rejects a body without an indexer', async () => {
    mocks.readBody.mockResolvedValue({})

    await expect(handler(mockEvent)).rejects.toThrow('400:')
    expect(mocks.client.createIndexer).not.toHaveBeenCalled()
  })

  it('rejects an empty request body', async () => {
    mocks.readBody.mockResolvedValue(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('400:')
    expect(mocks.client.createIndexer).not.toHaveBeenCalled()
  })

  it('rejects an empty indexer name', async () => {
    mocks.readBody.mockResolvedValue({ indexer: payload({ name: ' ' }) })

    await expect(handler(mockEvent)).rejects.toThrow('400:')
    expect(mocks.client.createIndexer).not.toHaveBeenCalled()
  })

  it('rolls the indexer back when the tracker sync fails', async () => {
    mocks.syncIndexerTracker.mockRejectedValue(new Error('tracker failed'))

    await expect(handler(mockEvent)).rejects.toThrow('tracker failed')
    expect(mocks.client.deleteIndexer).toHaveBeenCalledWith(12)
  })
})
