import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockGetSetting = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

vi.mock('#server/types/settings', () => ({
  SETTINGS: { PREP_COUNTDOWN_ENABLED: 'prep_countdown_enabled', PREP_DELAY_SECONDS: 'prep_delay_seconds' }
}))

import handler from '#server/api/admin/prep-config.get'

describe('admin/prep-config.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetSetting.mockReset()
  })

  const mockEvent = {} as never

  it('returns prep config for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockImplementation((key: string) => {
      if (key === 'prep_countdown_enabled') return 'true'
      if (key === 'prep_delay_seconds') return '45'
      return null
    })

    const result = await handler(mockEvent)
    expect(result).toEqual({ enabled: true, delaySeconds: 45 })
  })

  it('returns defaults when no settings', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockReturnValue(null)

    const result = await handler(mockEvent)
    expect(result).toEqual({ enabled: false, delaySeconds: 30 })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
