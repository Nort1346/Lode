import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockPutSetting = vi.hoisted(() => vi.fn())
const mockReadBody = vi.fn()

vi.mock('#server/utils/settings', () => ({
  putSetting: mockPutSetting
}))

vi.mock('#server/utils/i18n-server', () => ({
  DISCORD_LOCALE_OPTIONS: ['en', 'pl', 'de', 'fr', 'es']
}))

vi.mock('#server/types/settings', () => ({
  SETTINGS: { DISCORD_LOCALE: 'discord_locale' }
}))

import handler from '#server/api/admin/discord-locale.put'

describe('admin/discord-locale.put', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('readBody', mockReadBody)
    mockPutSetting.mockReset()
    mockReadBody.mockReset()
  })

  const mockEvent = {} as never

  it('saves valid locale for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ locale: 'pl' })

    const result = await handler(mockEvent)
    expect(result).toEqual({ locale: 'pl' })
    expect(mockPutSetting).toHaveBeenCalledWith('discord_locale', 'pl')
  })

  it('throws 400 for invalid locale', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ locale: 'invalid' })

    await expect(handler(mockEvent)).rejects.toThrow('400:')
  })

  it('throws 400 when locale is missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({})

    await expect(handler(mockEvent)).rejects.toThrow('400:')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
