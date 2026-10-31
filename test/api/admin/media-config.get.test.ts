import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../helpers'

const { mockGetMediaConfig } = vi.hoisted(() => ({
  mockGetMediaConfig: vi.fn()
}))

vi.mock('#server/utils/library/media-settings', () => ({
  getMediaConfig: mockGetMediaConfig
}))

const mockGetUserSession = vi.fn()

import handler from '#server/api/admin/media-config.get'

describe('admin/media-config.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    mockGetUserSession.mockReset()
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({}))
    )
  })

  const mockEvent = {} as never

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user', username: 'user1' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })

  it('returns media config with the staging status', async () => {
    mockGetMediaConfig.mockResolvedValue({
      enabled: true,
      importMode: 'copy',
      importExtraFiles: true,
      extraFileExtensions: ['srt', 'nfo']
    })
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ downloadPathMovies: '/downloads/movies', downloadPathSeries: '/downloads/series' }))
    )

    const result = await handler(mockEvent)

    expect(result).toEqual({
      enabled: true,
      importMode: 'copy',
      importExtraFiles: true,
      extraFileExtensions: 'srt, nfo',
      staging: { movies: true, series: true }
    })
  })

  it('reports missing staging paths', async () => {
    mockGetMediaConfig.mockResolvedValue({
      enabled: false,
      importMode: 'hardlink',
      importExtraFiles: false,
      extraFileExtensions: ['srt']
    })
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ downloadPathMovies: '  ' }))
    )

    const result = await handler(mockEvent)

    expect(result.staging).toEqual({ movies: false, series: false })
  })
})
