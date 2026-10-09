import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRepos = vi.hoisted(() => ({
  settings: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  }
}))

vi.mock('#server/repositories', () => ({
  getReposAsync: vi.fn(() => Promise.resolve(mockRepos))
}))

import {
  getMediaConfig,
  getMediaImportMode,
  isMediaManageEnabled,
  parseImportMode
} from '#server/utils/library/media-settings'

describe('parseImportMode', () => {
  it('accepts known modes', () => {
    expect(parseImportMode('hardlink')).toBe('hardlink')
    expect(parseImportMode('copy')).toBe('copy')
    expect(parseImportMode('move')).toBe('move')
  })

  it('falls back to hardlink for unknown or missing values', () => {
    expect(parseImportMode('symlink')).toBe('hardlink')
    expect(parseImportMode(undefined)).toBe('hardlink')
  })
})

describe('settings-backed helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('isMediaManageEnabled defaults to false', async () => {
    mockRepos.settings.get.mockResolvedValue(undefined)
    await expect(isMediaManageEnabled()).resolves.toBe(false)
  })

  it('getMediaImportMode falls back to hardlink', async () => {
    mockRepos.settings.get.mockResolvedValue(undefined)
    await expect(getMediaImportMode()).resolves.toBe('hardlink')
  })

  it('getMediaConfig combines enabled and import mode', async () => {
    mockRepos.settings.get.mockImplementation(async (key: string) => {
      if (key === 'media_manage_enabled') return 'true'
      if (key === 'media_import_mode') return 'copy'
      return undefined
    })
    const config = await getMediaConfig()
    expect(config).toEqual({ enabled: true, importMode: 'copy' })
  })
})
