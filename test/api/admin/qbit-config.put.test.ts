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
  SETTINGS: { QBIT_AUTO_REMOVE_COMPLETED: 'qbit_auto_remove_completed' }
}))

import handler from '#server/api/admin/qbit-config.put'

describe('admin/qbit-config.put', () => {
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

  it('stores autoRemoveCompleted as true', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ autoRemoveCompleted: true })

    const result = await handler(mockEvent)

    expect(result).toEqual({ success: true })
    expect(mockPutSetting).toHaveBeenCalledWith('qbit_auto_remove_completed', 'true')
  })

  it('stores autoRemoveCompleted as false', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ autoRemoveCompleted: false })

    await handler(mockEvent)

    expect(mockPutSetting).toHaveBeenCalledWith('qbit_auto_remove_completed', 'false')
  })

  it('does not write the setting when the field is missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({})

    await handler(mockEvent)

    expect(mockPutSetting).not.toHaveBeenCalled()
  })

  it('logs the activity', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ autoRemoveCompleted: true })

    await handler(mockEvent)

    expect(mockLogActivity).toHaveBeenCalledWith(
      mockEvent,
      expect.objectContaining({ action: 'qbit_config_update', userId: 'a1', username: 'admin' })
    )
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
