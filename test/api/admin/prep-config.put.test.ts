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
  SETTINGS: { PREP_COUNTDOWN_ENABLED: 'prep_countdown_enabled', PREP_DELAY_SECONDS: 'prep_delay_seconds' }
}))

import handler from '#server/api/admin/prep-config.put'

describe('admin/prep-config.put', () => {
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

  it('updates enabled setting', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ enabled: true })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockPutSetting).toHaveBeenCalledWith('prep_countdown_enabled', 'true')
  })

  it('clamps delaySeconds to the maximum', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ delaySeconds: 600 })

    await handler(mockEvent)
    expect(mockPutSetting).toHaveBeenCalledWith('prep_delay_seconds', '300')
  })

  it('clamps delaySeconds to zero', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ delaySeconds: -5 })

    await handler(mockEvent)
    expect(mockPutSetting).toHaveBeenCalledWith('prep_delay_seconds', '0')
  })

  it('rounds delaySeconds', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ delaySeconds: 15.7 })

    await handler(mockEvent)
    expect(mockPutSetting).toHaveBeenCalledWith('prep_delay_seconds', '16')
  })

  it('ignores a non-finite delay', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ delaySeconds: Number.NaN })

    await handler(mockEvent)
    expect(mockPutSetting).not.toHaveBeenCalledWith('prep_delay_seconds', expect.anything())
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
