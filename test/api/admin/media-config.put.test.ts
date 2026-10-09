import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const { mockPutSetting } = vi.hoisted(() => ({
  mockPutSetting: vi.fn()
}))

vi.mock('#server/utils/settings', () => ({
  putSetting: mockPutSetting
}))

const mockGetUserSession = vi.fn()

import handler from '#server/api/admin/media-config.put'

describe('admin/media-config.put', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetUserSession.mockReset()
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockPutSetting.mockReset()
    mockPutSetting.mockResolvedValue(undefined)
    vi.stubGlobal('readBody', vi.fn())
  })

  const mockEvent = {} as never

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })
    vi.stubGlobal(
      'readBody',
      vi.fn(async () => ({}))
    )

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })

  it('saves enabled and import mode', async () => {
    vi.stubGlobal(
      'readBody',
      vi.fn(async () => ({ enabled: true, importMode: 'copy' }))
    )

    const result = await handler(mockEvent)

    expect(result).toEqual({ success: true })
    expect(mockPutSetting).toHaveBeenCalledWith('media_manage_enabled', 'true')
    expect(mockPutSetting).toHaveBeenCalledWith('media_import_mode', 'copy')
  })

  it('normalizes unknown import modes to hardlink', async () => {
    vi.stubGlobal(
      'readBody',
      vi.fn(async () => ({ importMode: 'symlink' }))
    )

    await handler(mockEvent)

    expect(mockPutSetting).toHaveBeenCalledWith('media_import_mode', 'hardlink')
  })
})
