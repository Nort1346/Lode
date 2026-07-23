import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockGetRouterParam = vi.fn()

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  sessions: { id: 'id' }
}))

import handler from '#server/api/admin/sessions/[id].delete'

describe('admin/sessions/[id].delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('getRouterParam', mockGetRouterParam)
    mockGetRouterParam.mockReset()
    mockRun.mockReset()
  })

  const mockEvent = {} as never

  it('deletes session by id', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue('s1')
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        delete: vi.fn(() => ({
          where: vi.fn(() => ({
            run: mockRun
          }))
        }))
      }))
    )

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
  })

  it('throws 400 when id is missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue(null)

    await expect(handler(mockEvent)).rejects.toThrow('400: Session ID required')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
