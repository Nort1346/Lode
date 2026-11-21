import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mocks = vi.hoisted(() => ({
  client: {
    listIndexers: vi.fn(),
    getIndexerStats: vi.fn(),
    getIndexerStatuses: vi.fn()
  },
  findAll: vi.fn()
}))

vi.mock('#server/utils/prowlarr-admin', async () => {
  const actual = await vi.importActual<typeof import('#server/utils/prowlarr-admin')>('#server/utils/prowlarr-admin')
  return {
    ...actual,
    requireProwlarrAdminClient: () => mocks.client
  }
})

vi.mock('#server/repositories', () => ({
  getReposAsync: async () => ({
    customTrackers: { findAll: mocks.findAll }
  })
}))

import handler from '#server/api/admin/indexers/index.get'

const mockGetUserSession = vi.fn()

function resource(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Nyaa',
    definitionName: 'nyaasi',
    implementation: 'Cardigann',
    implementationName: 'Cardigann',
    configContract: 'CardigannSettings',
    protocol: 'torrent',
    privacy: 'public',
    language: 'en-US',
    enable: true,
    priority: 25,
    appProfileId: 1,
    tags: [2],
    fields: [],
    indexerUrls: ['https://nyaa.si/'],
    ...overrides
  }
}

describe('admin/indexers/index.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', username: 'admin', role: 'admin' } })
    mocks.client.listIndexers.mockResolvedValue([])
    mocks.client.getIndexerStats.mockResolvedValue({ indexers: [] })
    mocks.client.getIndexerStatuses.mockResolvedValue([])
    mocks.findAll.mockResolvedValue([])
  })

  const mockEvent = {} as never

  it('requires an admin session', async () => {
    mockGetUserSession.mockResolvedValue({})

    await expect(handler(mockEvent)).rejects.toThrow('401:')
  })

  it('returns indexers with stats, status and tracker badges', async () => {
    mocks.client.listIndexers.mockResolvedValue([
      resource(),
      resource({ id: 2, name: 'Private', privacy: 'private', enable: false }),
      resource({ id: 3, name: 'Blocked', privacy: 'semiPrivate' })
    ])
    mocks.client.getIndexerStats.mockResolvedValue({
      indexers: [
        {
          indexerId: 1,
          indexerName: 'Nyaa',
          averageResponseTime: 120,
          averageGrabResponseTime: 80,
          numberOfQueries: 10,
          numberOfGrabs: 3,
          numberOfRssQueries: 1,
          numberOfAuthQueries: 2,
          numberOfFailedQueries: 1,
          numberOfFailedGrabs: 0,
          numberOfFailedRssQueries: 0,
          numberOfFailedAuthQueries: 0
        }
      ]
    })
    mocks.client.getIndexerStatuses.mockResolvedValue([{ indexerId: 3 }])
    mocks.findAll.mockResolvedValue([
      {
        id: 'tracker-1',
        indexerName: 'Nyaa',
        trackerType: 'guid',
        cookie: 'cookie',
        loginUrl: null,
        loginUsername: null,
        loginPassword: null,
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    ])

    const result = await handler(mockEvent)

    expect(result.indexers).toHaveLength(3)
    expect(result.indexers.map((indexer) => indexer.name)).toEqual(['Blocked', 'Nyaa', 'Private'])

    const nyaa = result.indexers.find((indexer) => indexer.name === 'Nyaa')
    expect(nyaa?.stats).toEqual({
      queries: 10,
      grabs: 3,
      failedQueries: 1,
      failedGrabs: 0,
      averageResponseTime: 120
    })
    expect(nyaa?.tracker).toEqual({ id: 'tracker-1', trackerType: 'guid', enabled: true })

    const privateIndexer = result.indexers.find((indexer) => indexer.name === 'Private')
    expect(privateIndexer?.privacy).toBe('private')
    expect(privateIndexer?.tracker).toBeNull()

    const blocked = result.indexers.find((indexer) => indexer.name === 'Blocked')
    expect(blocked?.disabledByProwlarr).toBe(true)

    expect(result.summary).toEqual({
      total: 3,
      enabled: 2,
      private: 2,
      disabledByProwlarr: 1,
      linkedTrackers: 1
    })
  })

  it('does not flag disabled indexers as blocked', async () => {
    mocks.client.listIndexers.mockResolvedValue([resource({ id: 2, name: 'Disabled', enable: false })])
    mocks.client.getIndexerStatuses.mockResolvedValue([{ indexerId: 2 }])

    const result = await handler(mockEvent)

    expect(result.indexers[0]?.disabledByProwlarr).toBe(false)
  })
})
