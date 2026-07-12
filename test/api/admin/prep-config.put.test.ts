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
  SETTINGS: { PREP_COUNTDOWN_ENABLED: 'prep_countdown_enabled', PREP_SPEED_MB: 'prep_speed_mb' }
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

  it('updates speedMb with clamping', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ speedMb: 200 })

    await handler(mockEvent)
    expect(mockPutSetting).toHaveBeenCalledWith('prep_speed_mb', '100')
  })

  it('clamps speedMb to minimum 1', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ speedMb: -5 })

    await handler(mockEvent)
    expect(mockPutSetting).toHaveBeenCalledWith('prep_speed_mb', '1')
  })

  it('rounds speedMb', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ speedMb: 15.7 })

    await handler(mockEvent)
    expect(mockPutSetting).toHaveBeenCalledWith('prep_speed_mb', '16')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
