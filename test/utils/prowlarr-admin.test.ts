import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ProwlarrAdminClient,
  ProwlarrAdminError,
  buildIndexerResource,
  clearProwlarrIndexerSchemaCache,
  getProwlarrIndexerSchema,
  normalizePrivacy,
  parseIndexerId,
  parseIndexerIds,
  toDefinitionSummary,
  validateIndexerPayload
} from '#server/utils/prowlarr-admin'
import type { IndexerPayload } from '#shared/indexers'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function emptyResponse(status = 200): Response {
  return new Response('', { status })
}

const basePayload: IndexerPayload = {
  name: 'Test Indexer',
  enable: true,
  priority: 25,
  appProfileId: 1,
  tags: [1, 1, 2],
  definitionName: 'test-indexer',
  implementation: 'Cardigann',
  implementationName: 'Cardigann',
  configContract: 'CardigannSettings',
  protocol: 'torrent',
  privacy: 'private',
  fields: [{ name: 'baseUrl', value: 'https://example.test/' }]
}

describe('prowlarr-admin client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    clearProwlarrIndexerSchemaCache()
  })

  it('lists and normalizes indexers', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          name: 'Nyaa',
          definitionName: 'nyaasi',
          implementation: 'Cardigann',
          implementationName: 'Cardigann',
          configContract: 'CardigannSettings',
          protocol: 'torrent',
          privacy: 'public',
          enable: true,
          priority: 25,
          appProfileId: 1,
          tags: [3],
          fields: [{ name: 'baseUrl', type: 'select', value: 'https://nyaa.si/' }]
        }
      ])
    )

    const client = new ProwlarrAdminClient('http://prowlarr.test/api', 'secret-key')
    const indexers = await client.listIndexers()

    expect(fetchMock).toHaveBeenCalledWith(
      'http://prowlarr.test/api/api/v1/indexer',
      expect.objectContaining({ method: 'GET' })
    )
    expect(indexers).toHaveLength(1)
    expect(indexers[0]?.name).toBe('Nyaa')
    expect(indexers[0]?.privacy).toBe('public')
    expect(indexers[0]?.tags).toEqual([3])
  })

  it('maps 404 responses to a ProwlarrAdminError', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'IndexerDefinition with ID 9 does not exist' }, 404))

    const client = new ProwlarrAdminClient('http://prowlarr.test', 'secret-key')
    await expect(client.getIndexer(9)).rejects.toMatchObject({
      name: 'ProwlarrAdminError',
      status: 404
    })
  })

  it('maps an unreachable Prowlarr to status 502', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'))

    const client = new ProwlarrAdminClient('http://prowlarr.test', 'secret-key')
    await expect(client.listIndexers()).rejects.toMatchObject({ status: 502 })
  })

  it('maps a timeout to status 504', async () => {
    const timeout = new Error('The operation was aborted due to timeout')
    timeout.name = 'TimeoutError'
    fetchMock.mockRejectedValue(timeout)

    const client = new ProwlarrAdminClient('http://prowlarr.test', 'secret-key')
    await expect(client.listIndexers()).rejects.toMatchObject({ status: 504 })
  })

  it('returns validation failures when testing an indexer fails', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        [
          {
            propertyName: 'baseUrl',
            errorMessage: 'Unable to connect to indexer',
            severity: 'error'
          }
        ],
        400
      )
    )

    const client = new ProwlarrAdminClient('http://prowlarr.test', 'secret-key')
    const result = await client.testIndexer({ name: 'Test' })

    expect(result.isValid).toBe(false)
    expect(result.validationFailures).toEqual([
      {
        propertyName: 'baseUrl',
        errorMessage: 'Unable to connect to indexer',
        severity: 'error'
      }
    ])
  })

  it('sends bulk update and delete payloads', async () => {
    fetchMock.mockImplementation(async () => emptyResponse(202))

    const client = new ProwlarrAdminClient('http://prowlarr.test', 'secret-key')
    await client.bulkUpdateIndexers([1, 2], false)
    await client.bulkDeleteIndexers([3])

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://prowlarr.test/api/v1/indexer/bulk',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ ids: [1, 2], enable: false })
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://prowlarr.test/api/v1/indexer/bulk',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ ids: [3] })
      })
    )
  })

  it('caches the schema between calls', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      prowlarrUrl: 'http://prowlarr.test',
      prowlarrApiKey: 'secret-key'
    }))
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          name: 'Nyaa',
          definitionName: 'nyaasi',
          implementation: 'Cardigann',
          implementationName: 'Cardigann',
          configContract: 'CardigannSettings',
          indexerUrls: ['https://nyaa.si/'],
          fields: []
        }
      ])
    )

    const first = await getProwlarrIndexerSchema()
    const second = await getProwlarrIndexerSchema()

    expect(first).toHaveLength(1)
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces upstream validation failures on create', async () => {
    fetchMock.mockImplementation(async () => jsonResponse([{ errorMessage: 'Priority is invalid' }], 400))

    const client = new ProwlarrAdminClient('http://prowlarr.test', 'secret-key')

    await expect(client.createIndexer({ name: 'Test' })).rejects.toBeInstanceOf(ProwlarrAdminError)
    await expect(client.createIndexer({ name: 'Test' })).rejects.toThrow('Priority is invalid')
  })
})

describe('prowlarr-admin helpers', () => {
  it('normalizes privacy values', () => {
    expect(normalizePrivacy('public')).toBe('public')
    expect(normalizePrivacy('semiPrivate')).toBe('semiPrivate')
    expect(normalizePrivacy('private')).toBe('private')
    expect(normalizePrivacy(undefined)).toBe('private')
  })

  it('builds a definition summary', () => {
    const summary = toDefinitionSummary({
      name: 'Nyaa',
      definitionName: 'nyaasi',
      description: 'Anime',
      language: 'en-US',
      privacy: 'public',
      protocol: 'torrent',
      implementation: 'Cardigann',
      implementationName: 'Cardigann',
      configContract: 'CardigannSettings',
      indexerUrls: ['https://nyaa.si/'],
      fields: []
    })

    expect(summary.indexerUrl).toBe('https://nyaa.si/')
    expect(summary.privacy).toBe('public')
    expect(summary.supportsSearch).toBe(false)
  })

  it('adds definitionFile and deduplicates fields and tags', () => {
    const resource = buildIndexerResource(basePayload)

    expect(resource.name).toBe('Test Indexer')
    expect(resource.tags).toEqual([1, 2])
    expect(resource.fields).toEqual([
      { name: 'definitionFile', value: 'test-indexer' },
      { name: 'baseUrl', value: 'https://example.test/' }
    ])
  })

  it('keeps the base resource metadata on update', () => {
    const resource = buildIndexerResource(
      { ...basePayload, definitionName: undefined },
      { id: 5, definitionName: 'existing-definition', name: 'Old name' }
    )

    expect(resource.id).toBe(5)
    expect(resource.definitionName).toBe('existing-definition')
    expect(resource.name).toBe('Test Indexer')
  })

  it('rejects invalid payloads', () => {
    expect(() => validateIndexerPayload({ ...basePayload, name: ' ' }, 'create')).toThrow('400:')
    expect(() => validateIndexerPayload({ ...basePayload, appProfileId: 0 }, 'create')).toThrow('400:')
    expect(() => validateIndexerPayload({ ...basePayload, priority: 51 }, 'create')).toThrow('400:')
    expect(() => validateIndexerPayload({ ...basePayload, definitionName: '' }, 'create')).toThrow('400:')
    expect(() => validateIndexerPayload({ ...basePayload, definitionName: '' }, 'update')).not.toThrow()
  })

  it('parses indexer IDs', () => {
    expect(parseIndexerId('12')).toBe(12)
    expect(() => parseIndexerId('0')).toThrow('400:')
    expect(() => parseIndexerId(undefined)).toThrow('400:')
    expect(parseIndexerIds([1, 1, 2])).toEqual([1, 2])
    expect(() => parseIndexerIds([])).toThrow('400:')
    expect(() => parseIndexerIds([1, '2'])).toThrow('400:')
  })
})
