import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockGetSetting = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

vi.mock('#server/types/settings', () => ({
  SETTINGS: {
    QBIT_AUTO_REMOVE_COMPLETED: 'qbit_auto_remove_completed',
    QBIT_SEEDING_ENABLED: 'qbit_seeding_enabled'
  }
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
    mockGetSetting.mockImplementation((key: string) => (key === 'qbit_auto_remove_completed' ? 'true' : 'true'))

    const result = await handler(mockEvent)

    expect(result).toEqual({ autoRemoveCompleted: true, seedingEnabled: true })
    expect(mockGetSetting).toHaveBeenCalledWith('qbit_auto_remove_completed')
    expect(mockGetSetting).toHaveBeenCalledWith('qbit_seeding_enabled')
  })

  it('returns autoRemoveCompleted as false when unset', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockImplementation((key: string) => (key === 'qbit_auto_remove_completed' ? undefined : undefined))

    const result = await handler(mockEvent)

    expect(result).toEqual({ autoRemoveCompleted: false, seedingEnabled: true })
  })

  it('returns seedingEnabled as false when explicitly disabled', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockImplementation((key: string) => (key === 'qbit_seeding_enabled' ? 'false' : undefined))

    const result = await handler(mockEvent)

    expect(result).toEqual({ autoRemoveCompleted: false, seedingEnabled: false })
  })

  it('defaults seedingEnabled to true for existing installs (unset)', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockResolvedValue(undefined)

    const result = await handler(mockEvent)

    expect(result).toEqual(expect.objectContaining({ seedingEnabled: true }))
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
