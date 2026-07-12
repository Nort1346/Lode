import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockRun = vi.fn()
const mockGetTracker = vi.fn()
const mockGetRouterParam = vi.fn()
const mockLogActivity = vi.fn()

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  customTrackers: { id: 'id', indexerName: 'indexerName' }
}))

import handler from '#server/api/admin/trackers/[id].delete'

describe('admin/trackers/[id].delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('getRouterParam', mockGetRouterParam)
    vi.stubGlobal('logActivity', mockLogActivity)
    mockGetRouterParam.mockReset()
    mockRun.mockReset()
    mockGetTracker.mockReset()
    mockLogActivity.mockReset()
  })

  const mockEvent = {} as never

  function stubDb(existing: unknown) {
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              get: vi.fn(() => existing)
            }))
          }))
        })),
        delete: vi.fn(() => ({
          where: vi.fn(() => ({
            run: mockRun
          }))
        }))
      }))
    )
  }

  it('deletes tracker', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('t1')
    stubDb({ id: 't1', indexerName: 'MyTracker' })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockRun).toHaveBeenCalled()
    expect(mockLogActivity).toHaveBeenCalled()
  })

  it('throws 400 when id missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue(null)

    await expect(handler(mockEvent)).rejects.toThrow('400: Tracker ID is required')
  })

  it('throws 404 when tracker not found', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue('t1')
    stubDb(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('404: Tracker not found')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
