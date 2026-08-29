import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockSaveBruteForceConfig = vi.fn()
const mockGetBruteForceConfig = vi.fn()
const mockLogActivity = vi.fn()
const mockReadBody = vi.fn()

vi.stubGlobal('saveBruteForceConfig', mockSaveBruteForceConfig)
vi.stubGlobal('getBruteForceConfig', mockGetBruteForceConfig)
vi.stubGlobal('logActivity', mockLogActivity)
vi.stubGlobal('readBody', mockReadBody)

import handler from '#server/api/admin/brute-force/config.put'

describe('admin/brute-force/config.put', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('logActivity', mockLogActivity)
    vi.stubGlobal('readBody', mockReadBody)
    mockSaveBruteForceConfig.mockReset()
    mockGetBruteForceConfig.mockReset()
    mockLogActivity.mockReset()
    mockReadBody.mockReset()
  })

  const mockEvent = {} as never

  it('saves config and returns success for admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ maxAttemptsPerIp: 10 })
    mockSaveBruteForceConfig.mockResolvedValue(undefined)
    mockGetBruteForceConfig.mockResolvedValue({ maxAttemptsPerIp: 10, ipBlockDurationMinutes: 30, windowMinutes: 60 })

    const result = await handler(mockEvent)
    expect(result).toEqual({
      success: true,
      config: { maxAttemptsPerIp: 10, ipBlockDurationMinutes: 30, windowMinutes: 60 }
    })
    expect(mockSaveBruteForceConfig).toHaveBeenCalledWith({ maxAttemptsPerIp: 10 })
    expect(mockLogActivity).toHaveBeenCalledWith(
      mockEvent,
      expect.objectContaining({
        action: 'brute_force_config_update',
        userId: 'a1',
        username: 'admin'
      })
    )
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })

  it('throws 400 when maxAttemptsPerIp is not an integer', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ maxAttemptsPerIp: 2.5 })

    await expect(handler(mockEvent)).rejects.toThrow('400: maxAttemptsPerIp must be an integer between 1 and 100')
  })

  it('throws 400 when maxAttemptsPerIp is out of range', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ maxAttemptsPerIp: 0 })

    await expect(handler(mockEvent)).rejects.toThrow('400: maxAttemptsPerIp must be an integer between 1 and 100')
  })

  it('throws 400 when ipBlockDurationMinutes exceeds the maximum', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ ipBlockDurationMinutes: 1441 })

    await expect(handler(mockEvent)).rejects.toThrow(
      '400: ipBlockDurationMinutes must be an integer between 1 and 1440'
    )
  })

  it('throws 400 when windowMinutes is not an integer', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ windowMinutes: '30' })

    await expect(handler(mockEvent)).rejects.toThrow('400: windowMinutes must be an integer between 1 and 1440')
  })

  it('saves all three fields when provided', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ maxAttemptsPerIp: 5, ipBlockDurationMinutes: 15, windowMinutes: 120 })
    mockSaveBruteForceConfig.mockResolvedValue(undefined)
    mockGetBruteForceConfig.mockResolvedValue({ maxAttemptsPerIp: 5, ipBlockDurationMinutes: 15, windowMinutes: 120 })

    const result = await handler(mockEvent)

    expect(result).toEqual({
      success: true,
      config: { maxAttemptsPerIp: 5, ipBlockDurationMinutes: 15, windowMinutes: 120 }
    })
    expect(mockSaveBruteForceConfig).toHaveBeenCalledWith({
      maxAttemptsPerIp: 5,
      ipBlockDurationMinutes: 15,
      windowMinutes: 120
    })
  })
})
