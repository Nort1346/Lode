import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockCheckAllDisks = vi.hoisted(() => vi.fn())
const mockIsDiskCheckEnabled = vi.hoisted(() => vi.fn())
const mockGetDiskMinFreeGb = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/disk', () => ({
  checkAllDisks: mockCheckAllDisks,
  isDiskCheckEnabled: mockIsDiskCheckEnabled,
  getDiskMinFreeGb: mockGetDiskMinFreeGb
}))

import handler from '#server/api/admin/disk-status.get'

describe('admin/disk-status.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockCheckAllDisks.mockReset()
    mockIsDiskCheckEnabled.mockReset()
    mockGetDiskMinFreeGb.mockReset()
  })

  const mockEvent = {} as never

  it('returns disk statuses for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ disks: '/data,/media' }))
    )
    mockGetDiskMinFreeGb.mockReturnValue(50)
    mockIsDiskCheckEnabled.mockReturnValue(true)
    mockCheckAllDisks.mockReturnValue([
      { path: '/data', status: 'ok' },
      { path: '/media', status: 'low' }
    ])

    const result = await handler(mockEvent)
    expect(result).toEqual({
      disks: [
        { path: '/data', status: 'ok' },
        { path: '/media', status: 'low' }
      ],
      minFreeSpaceGb: 50,
      checkEnabled: true
    })
    expect(mockCheckAllDisks).toHaveBeenCalledWith(['/data', '/media'], 50)
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
