import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockUnblockIp = vi.fn()
const mockLogActivity = vi.fn()
const mockReadBody = vi.fn()

vi.stubGlobal('unblockIp', mockUnblockIp)

import handler from '#server/api/admin/brute-force/blocked-ips.delete'

describe('admin/brute-force/blocked-ips.delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('logActivity', mockLogActivity)
    vi.stubGlobal('readBody', mockReadBody)
    mockUnblockIp.mockReset()
    mockLogActivity.mockReset()
    mockReadBody.mockReset()
  })

  const mockEvent = {} as never

  it('unblocks IP and returns success for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ ip: '1.2.3.4' })
    mockUnblockIp.mockResolvedValue(undefined)

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockUnblockIp).toHaveBeenCalledWith('1.2.3.4')
    expect(mockLogActivity).toHaveBeenCalledWith(
      mockEvent,
      expect.objectContaining({
        action: 'brute_force_unblock_ip'
      })
    )
  })

  it('throws 400 when ip is missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({})

    await expect(handler(mockEvent)).rejects.toThrow('400: IP is required')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
