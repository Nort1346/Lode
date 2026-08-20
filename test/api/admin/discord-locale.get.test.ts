import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockGetSetting = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

import handler from '#server/api/admin/discord-locale.get'

describe('admin/discord-locale.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
  })

  const mockEvent = {} as never

  it('returns stored locale for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockResolvedValue('pl')

    const result = await handler(mockEvent)
    expect(result).toEqual({ locale: 'pl' })
  })

  it('defaults to en when no setting found', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetSetting.mockResolvedValue(undefined)

    const result = await handler(mockEvent)
    expect(result).toEqual({ locale: 'en' })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
