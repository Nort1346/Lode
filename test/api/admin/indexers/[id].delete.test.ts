import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mocks = vi.hoisted(() => ({
  client: {
    getIndexer: vi.fn(),
    deleteIndexer: vi.fn()
  },
  getRouterParam: vi.fn(),
  findByIndexerName: vi.fn()
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
    customTrackers: { findByIndexerName: mocks.findByIndexerName }
  })
}))

import handler from '#server/api/admin/indexers/[id].delete'

const mockGetUserSession = vi.fn()

describe('admin/indexers/[id].delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', username: 'admin', role: 'admin' } })
    vi.stubGlobal('getRouterParam', mocks.getRouterParam)
    mocks.getRouterParam.mockReset()
    mocks.client.getIndexer.mockReset()
    mocks.client.deleteIndexer.mockReset()
    mocks.findByIndexerName.mockReset()
    mocks.getRouterParam.mockReturnValue('3')
    mocks.client.getIndexer.mockResolvedValue({ id: 3, name: 'Nyaa' })
    mocks.client.deleteIndexer.mockResolvedValue(undefined)
    mocks.findByIndexerName.mockResolvedValue(undefined)
  })

  const mockEvent = {} as never

  it('deletes the indexer from Prowlarr', async () => {
    const result = await handler(mockEvent)

    expect(mocks.client.getIndexer).toHaveBeenCalledWith(3)
    expect(mocks.client.deleteIndexer).toHaveBeenCalledWith(3)
    expect(result).toEqual({ success: true, trackerStillLinked: false })
  })

  it('reports that a linked tracker was kept', async () => {
    mocks.findByIndexerName.mockResolvedValue({ id: 'tracker-1', indexerName: 'Nyaa' })

    const result = await handler(mockEvent)

    expect(result).toEqual({ success: true, trackerStillLinked: true })
    expect(mocks.findByIndexerName).toHaveBeenCalledWith('Nyaa')
  })

  it('rejects a missing id', async () => {
    mocks.getRouterParam.mockReturnValue(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('400:')
    expect(mocks.client.deleteIndexer).not.toHaveBeenCalled()
  })
})
