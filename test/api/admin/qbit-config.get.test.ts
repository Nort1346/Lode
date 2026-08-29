import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockGetSetting = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

vi.mock('#server/types/settings', () => ({
  SETTINGS: { QBIT_AUTO_REMOVE_COMPLETED: 'qbit_auto_remove_completed' }
}))

import handler from '#server/api/admin/qbit-config.get'

describe('admin/qbit-config.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetSetting.mockReset()
  })

  const mockEvent = {} as never

  it('returns autoRemoveCompleted as true when enabled', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockReturnValue('true')

    const result = await handler(mockEvent)

    expect(result).toEqual({ autoRemoveCompleted: true })
    expect(mockGetSetting).toHaveBeenCalledWith('qbit_auto_remove_completed')
  })

  it('returns autoRemoveCompleted as false when unset', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockReturnValue(undefined)

    const result = await handler(mockEvent)

    expect(result).toEqual({ autoRemoveCompleted: false })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
