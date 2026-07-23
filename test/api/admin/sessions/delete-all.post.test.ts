import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockReadBody = vi.fn()

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  sessions: { userId: 'userId' }
}))

import handler from '#server/api/admin/sessions/delete-all.post'

describe('admin/sessions/delete-all.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('readBody', mockReadBody)
    mockReadBody.mockReset()
    mockRun.mockReset()
  })

  const mockEvent = {} as never

  it('deletes all sessions for userId', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ userId: 'u1' })
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

  it('throws 400 when userId is missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({})

    await expect(handler(mockEvent)).rejects.toThrow('400: userId required')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
