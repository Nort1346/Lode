import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mocks = vi.hoisted(() => ({
  client: {
    getIndexerRaw: vi.fn(),
    updateIndexer: vi.fn()
  },
  assertIndexerTrackerLink: vi.fn(),
  syncIndexerTracker: vi.fn(),
  readBody: vi.fn(),
  getRouterParam: vi.fn()
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

import handler from '#server/api/admin/indexers/[id].put'

const mockGetUserSession = vi.fn()

function payload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Renamed Tracker',
    enable: true,
    priority: 25,
    appProfileId: 1,
    tags: [],
    fields: [{ name: 'baseUrl', value: 'https://tracker.test/' }],
    ...overrides
  }
}

function existingRaw() {
  return {
    id: 7,
    name: 'Old Name',
    definitionName: 'mytracker',
    implementation: 'Cardigann',
    implementationName: 'Cardigann',
    configContract: 'CardigannSettings',
    protocol: 'torrent',
    privacy: 'private',
    enable: true,
    priority: 25,
    appProfileId: 1,
    tags: [],
    fields: [{ name: 'baseUrl', value: 'https://old.test/' }],
    indexerUrls: ['https://old.test/']
  }
}

describe('admin/indexers/[id].put', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', username: 'admin', role: 'admin' } })
    vi.stubGlobal('readBody', mocks.readBody)
    vi.stubGlobal('getRouterParam', mocks.getRouterParam)
    mocks.getRouterParam.mockReturnValue('7')
    mocks.readBody.mockResolvedValue({ indexer: payload() })
    mocks.client.getIndexerRaw.mockResolvedValue(existingRaw())
    mocks.client.updateIndexer.mockResolvedValue({ id: 7, name: 'Renamed Tracker' })
    mocks.assertIndexerTrackerLink.mockResolvedValue(undefined)
    mocks.syncIndexerTracker.mockResolvedValue({ action: 'renamed', trackerId: 'tracker-1' })
  })

  const mockEvent = {} as never

  it('updates the indexer and syncs the renamed tracker', async () => {
    const result = await handler(mockEvent)

    expect(result).toEqual({ success: true, id: 7 })
    expect(mocks.assertIndexerTrackerLink).toHaveBeenCalledWith('Renamed Tracker', 'Old Name', undefined)
    expect(mocks.client.updateIndexer).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        id: 7,
        name: 'Renamed Tracker',
        definitionName: 'mytracker',
        privacy: 'private'
      })
    )
    expect(mocks.syncIndexerTracker).toHaveBeenCalledWith('Renamed Tracker', 'Old Name', undefined)
  })

  it('rejects an empty request body', async () => {
    mocks.readBody.mockResolvedValue(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('400:')
    expect(mocks.client.updateIndexer).not.toHaveBeenCalled()
  })

  it('rejects a body without an indexer', async () => {
    mocks.readBody.mockResolvedValue({})

    await expect(handler(mockEvent)).rejects.toThrow('400:')
    expect(mocks.client.updateIndexer).not.toHaveBeenCalled()
  })

  it('rejects an invalid route id', async () => {
    mocks.getRouterParam.mockReturnValue('not-a-number')

    await expect(handler(mockEvent)).rejects.toThrow('400:')
    expect(mocks.client.updateIndexer).not.toHaveBeenCalled()
  })

  it('rolls the indexer back when the tracker sync fails', async () => {
    mocks.syncIndexerTracker.mockRejectedValue(new Error('tracker failed'))

    await expect(handler(mockEvent)).rejects.toThrow('tracker failed')
    expect(mocks.client.updateIndexer).toHaveBeenCalledTimes(2)
    expect(mocks.client.updateIndexer).toHaveBeenLastCalledWith(7, existingRaw())
  })
})
