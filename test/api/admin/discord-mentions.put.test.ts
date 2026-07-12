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
  SETTINGS: { DISCORD_MENTIONS_ENABLED: 'discord_mentions_enabled' }
}))

import handler from '#server/api/admin/discord-mentions.put'

describe('admin/discord-mentions.put', () => {
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

  it('enables discord mentions', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ enabled: true })

    const result = await handler(mockEvent)
    expect(result).toEqual({ enabled: true })
    expect(mockPutSetting).toHaveBeenCalledWith('discord_mentions_enabled', 'true')
    expect(mockLogActivity).toHaveBeenCalledWith(
      mockEvent,
      expect.objectContaining({
        action: 'discord_mentions_update'
      })
    )
  })

  it('disables discord mentions', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ enabled: false })

    const result = await handler(mockEvent)
    expect(result).toEqual({ enabled: false })
    expect(mockPutSetting).toHaveBeenCalledWith('discord_mentions_enabled', 'false')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
