import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mocks = vi.hoisted(() => ({
  client: {
    getIndexerRaw: vi.fn(),
    testIndexer: vi.fn()
  },
  readBody: vi.fn()
}))

vi.mock('#server/utils/prowlarr-admin', async () => {
  const actual = await vi.importActual<typeof import('#server/utils/prowlarr-admin')>('#server/utils/prowlarr-admin')
  return {
    ...actual,
    requireProwlarrAdminClient: () => mocks.client
  }
})

import handler from '#server/api/admin/indexers/test.post'

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

describe('admin/indexers/test.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', username: 'admin', role: 'admin' } })
    vi.stubGlobal('readBody', mocks.readBody)
    mocks.readBody.mockReset()
    mocks.client.getIndexerRaw.mockReset()
    mocks.client.testIndexer.mockReset()
    mocks.client.getIndexerRaw.mockResolvedValue({
      id: 9,
      name: 'Nyaa',
      definitionName: 'nyaasi',
      fields: []
    })
    mocks.client.testIndexer.mockResolvedValue({ isValid: true, validationFailures: [] })
  })

  const mockEvent = {} as never

  it('tests an existing indexer by id', async () => {
    mocks.readBody.mockResolvedValue({ id: 9 })

    const result = await handler(mockEvent)

    expect(result).toEqual({ id: 9, isValid: true, validationFailures: [] })
    expect(mocks.client.getIndexerRaw).toHaveBeenCalledWith(9)
    expect(mocks.client.testIndexer).toHaveBeenCalledWith({
      id: 9,
      name: 'Nyaa',
      definitionName: 'nyaasi',
      fields: []
    })
  })

  it('tests an unsaved indexer payload without fetching from Prowlarr', async () => {
    mocks.readBody.mockResolvedValue({ indexer: payload() })
    mocks.client.testIndexer.mockResolvedValue({
      isValid: false,
      validationFailures: [{ errorMessage: 'Unable to connect' }]
    })

    const result = await handler(mockEvent)

    expect(mocks.client.getIndexerRaw).not.toHaveBeenCalled()
    expect(mocks.client.testIndexer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My Tracker',
        definitionName: 'mytracker',
        fields: [
          { name: 'definitionFile', value: 'mytracker' },
          { name: 'baseUrl', value: 'https://tracker.test/' }
        ]
      })
    )
    expect(result).toEqual({
      isValid: false,
      validationFailures: [{ errorMessage: 'Unable to connect' }]
    })
  })

  it('merges an edit payload with the existing indexer', async () => {
    mocks.readBody.mockResolvedValue({ id: 9, indexer: payload({ name: 'Renamed' }) })

    const result = await handler(mockEvent)

    expect(mocks.client.getIndexerRaw).toHaveBeenCalledWith(9)
    expect(mocks.client.testIndexer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 9,
        name: 'Renamed',
        definitionName: 'nyaasi'
      })
    )
    expect(result.id).toBe(9)
  })

  it('rejects a body without id or indexer', async () => {
    mocks.readBody.mockResolvedValue({})

    await expect(handler(mockEvent)).rejects.toThrow('400:')
    expect(mocks.client.testIndexer).not.toHaveBeenCalled()
  })
})
