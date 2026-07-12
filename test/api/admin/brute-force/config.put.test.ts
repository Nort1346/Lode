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
    mockReadBody.mockResolvedValue({ maxAttempts: 10 })
    mockSaveBruteForceConfig.mockResolvedValue(undefined)
    mockGetBruteForceConfig.mockResolvedValue({ maxAttempts: 10 })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, config: { maxAttempts: 10 } })
    expect(mockSaveBruteForceConfig).toHaveBeenCalledWith({ maxAttempts: 10 })
    expect(mockLogActivity).toHaveBeenCalledWith(
      mockEvent,
      expect.objectContaining({
        action: 'brute_force_config_update'
      })
    )
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
