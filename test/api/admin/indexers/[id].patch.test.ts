import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mocks = vi.hoisted(() => ({
  client: {
    getIndexerRaw: vi.fn(),
    updateIndexer: vi.fn()
  },
  getRouterParam: vi.fn(),
  readBody: vi.fn()
}))

vi.mock('#server/utils/prowlarr-admin', async () => {
  const actual = await vi.importActual<typeof import('#server/utils/prowlarr-admin')>('#server/utils/prowlarr-admin')
  return {
    ...actual,
    requireProwlarrAdminClient: () => mocks.client
  }
})

import handler from '#server/api/admin/indexers/[id].patch'

const mockGetUserSession = vi.fn()

describe('admin/indexers/[id].patch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', username: 'admin', role: 'admin' } })
    vi.stubGlobal('getRouterParam', mocks.getRouterParam)
    vi.stubGlobal('readBody', mocks.readBody)
    mocks.getRouterParam.mockReset()
    mocks.readBody.mockReset()
    mocks.client.getIndexerRaw.mockReset()
    mocks.client.updateIndexer.mockReset()
    mocks.getRouterParam.mockReturnValue('4')
    mocks.readBody.mockResolvedValue({ enable: false })
    mocks.client.getIndexerRaw.mockResolvedValue({
      id: 4,
      name: 'Nyaa',
      enable: true,
      priority: 25,
      appProfileId: 1,
      fields: []
    })
    mocks.client.updateIndexer.mockResolvedValue({ id: 4 })
  })

  const mockEvent = {} as never

  it('merges quick updates into the existing indexer', async () => {
    mocks.readBody.mockResolvedValue({ enable: false, priority: 5, appProfileId: 2 })

    const result = await handler(mockEvent)

    expect(result).toEqual({ success: true, id: 4 })
    expect(mocks.client.updateIndexer).toHaveBeenCalledWith(4, {
      id: 4,
      name: 'Nyaa',
      enable: false,
      priority: 5,
      appProfileId: 2,
      fields: []
    })
  })

  it('returns early when there is nothing to update', async () => {
    mocks.readBody.mockResolvedValue({})

    const result = await handler(mockEvent)

    expect(result).toEqual({ success: true, id: 4 })
    expect(mocks.client.getIndexerRaw).not.toHaveBeenCalled()
    expect(mocks.client.updateIndexer).not.toHaveBeenCalled()
  })

  it('rejects invalid priorities', async () => {
    mocks.readBody.mockResolvedValue({ priority: 0 })

    await expect(handler(mockEvent)).rejects.toThrow('400:')
    expect(mocks.client.updateIndexer).not.toHaveBeenCalled()
  })

  it('rejects non-boolean enable values', async () => {
    mocks.readBody.mockResolvedValue({ enable: 'yes' })

    await expect(handler(mockEvent)).rejects.toThrow('400:')
  })

  it('rejects an invalid app profile id', async () => {
    mocks.readBody.mockResolvedValue({ appProfileId: 0 })

    await expect(handler(mockEvent)).rejects.toThrow('400:')
  })

  it('rejects a missing id', async () => {
    mocks.getRouterParam.mockReturnValue(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('400:')
  })
})
