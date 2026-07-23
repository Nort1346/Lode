import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockAll = vi.fn()

vi.mock('#server/database/schema', () => ({
  customTrackers: { id: 'id', indexerName: 'indexerName', loginPassword: 'loginPassword' }
}))

import handler from '#server/api/admin/trackers/index.get'

describe('admin/trackers/index.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockAll.mockReset()
  })

  const mockEvent = {} as never

  it('returns trackers with masked passwords', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockAll.mockReturnValue([
      { id: 't1', indexerName: 'tracker1', loginPassword: 'secret123', cookie: '' },
      { id: 't2', indexerName: 'tracker2', loginPassword: null, cookie: 'abc' },
      { id: 't3', indexerName: 'tracker3', loginPassword: '', cookie: '' }
    ])
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            all: mockAll,
            get: vi.fn()
          }))
        }))
      }))
    )

    const result = await handler(mockEvent)
    expect(result).toEqual({
      trackers: [
        { id: 't1', indexerName: 'tracker1', loginPassword: '***', cookie: '' },
        { id: 't2', indexerName: 'tracker2', loginPassword: null, cookie: 'abc' },
        { id: 't3', indexerName: 'tracker3', loginPassword: null, cookie: '' }
      ]
    })
  })

  it('returns empty trackers', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockAll.mockReturnValue([])
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            all: mockAll,
            get: vi.fn()
          }))
        }))
      }))
    )

    const result = await handler(mockEvent)
    expect(result).toEqual({ trackers: [] })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
