import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const mockGetUserSession = vi.fn()
const mockIsDiscordMentionsEnabled = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/discord', () => ({
  isDiscordMentionsEnabled: mockIsDiscordMentionsEnabled
}))

import handler from '#server/api/admin/discord-mentions.get'

describe('admin/discord-mentions.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockIsDiscordMentionsEnabled.mockReset()
  })

  const mockEvent = {} as never

  it('returns enabled status for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockIsDiscordMentionsEnabled.mockReturnValue(true)

    const result = await handler(mockEvent)
    expect(result).toEqual({ enabled: true })
  })

  it('returns disabled status', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockIsDiscordMentionsEnabled.mockReturnValue(false)

    const result = await handler(mockEvent)
    expect(result).toEqual({ enabled: false })
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
