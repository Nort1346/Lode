import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const { mockPutSetting } = vi.hoisted(() => ({
  mockPutSetting: vi.fn()
}))

vi.mock('#server/utils/settings', () => ({
  getSetting: vi.fn(),
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
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ downloadPathMovies: '/downloads/movies', downloadPathSeries: '/downloads/series' }))
    )
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

  it('refuses to enable without a staging dir', async () => {
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({}))
    )
    vi.stubGlobal(
      'readBody',
      vi.fn(async () => ({ enabled: true }))
    )

    await expect(handler(mockEvent)).rejects.toThrow('400: Set NUXT_DOWNLOAD_PATH_MOVIES')
    expect(mockPutSetting).not.toHaveBeenCalled()
  })

  it('still allows disabling without a staging dir', async () => {
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({}))
    )
    vi.stubGlobal(
      'readBody',
      vi.fn(async () => ({ enabled: false }))
    )

    await handler(mockEvent)

    expect(mockPutSetting).toHaveBeenCalledWith('media_manage_enabled', 'false')
  })

  it('normalizes unknown import modes to hardlink', async () => {
    vi.stubGlobal(
      'readBody',
      vi.fn(async () => ({ importMode: 'symlink' }))
    )

    await handler(mockEvent)

    expect(mockPutSetting).toHaveBeenCalledWith('media_import_mode', 'hardlink')
  })

  it('persists extra file settings', async () => {
    vi.stubGlobal(
      'readBody',
      vi.fn(async () => ({ importExtraFiles: true, extraFileExtensions: '.SRT, nfo' }))
    )

    await handler(mockEvent)

    expect(mockPutSetting).toHaveBeenCalledWith('media_import_extra_files', 'true')
    expect(mockPutSetting).toHaveBeenCalledWith('media_extra_file_extensions', 'srt,nfo')
  })
})
