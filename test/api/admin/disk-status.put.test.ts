import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockPutSetting = vi.hoisted(() => vi.fn())
const mockLogActivity = vi.fn()
const mockReadBody = vi.fn()

vi.mock('#server/utils/settings', () => ({
  putSetting: mockPutSetting
}))

vi.mock('#server/types/settings', () => ({
  SETTINGS: { DISK_CHECK_ENABLED: 'disk_check_enabled', DISK_MIN_FREE_GB: 'disk_min_free_gb' }
}))

import handler from '#server/api/admin/disk-status.put'

describe('admin/disk-status.put', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('logActivity', mockLogActivity)
    vi.stubGlobal('readBody', mockReadBody)
    mockPutSetting.mockReset()
    mockLogActivity.mockReset()
    mockReadBody.mockReset()
  })

  const mockEvent = {} as never

  it('updates checkEnabled', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ checkEnabled: true })

    const result = await handler(mockEvent)
    expect(result).toEqual({ ok: true })
    expect(mockPutSetting).toHaveBeenCalledWith('disk_check_enabled', 'true')
    expect(mockLogActivity).toHaveBeenCalled()
  })

  it('updates minFreeSpaceGb', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ minFreeSpaceGb: 100 })

    const result = await handler(mockEvent)
    expect(result).toEqual({ ok: true })
    expect(mockPutSetting).toHaveBeenCalledWith('disk_min_free_gb', '100')
  })

  it('updates both fields', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ checkEnabled: false, minFreeSpaceGb: 200 })

    await handler(mockEvent)
    expect(mockPutSetting).toHaveBeenCalledWith('disk_check_enabled', 'false')
    expect(mockPutSetting).toHaveBeenCalledWith('disk_min_free_gb', '200')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
