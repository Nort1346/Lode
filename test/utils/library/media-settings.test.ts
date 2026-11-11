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
  getExtraFileExtensions,
  getMediaConfig,
  getMediaImportMode,
  isImportExtraFilesEnabled,
  isMediaManageEnabled,
  parseExtraFileExtensions,
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

describe('parseExtraFileExtensions', () => {
  it('defaults to the built-in list when empty', () => {
    expect(parseExtraFileExtensions(undefined)).toContain('srt')
    expect(parseExtraFileExtensions('')).toContain('nfo')
    expect(parseExtraFileExtensions('  ')).toContain('nfo')
  })

  it('normalizes dots, casing and whitespace', () => {
    expect(parseExtraFileExtensions(' .SRT, Nfo ,,sub ')).toEqual(['srt', 'nfo', 'sub'])
  })

  it('drops invalid entries and falls back when nothing is left', () => {
    expect(parseExtraFileExtensions('srt, ../evil, !!')).toEqual(['srt'])
    expect(parseExtraFileExtensions('../evil, !!')).toContain('srt')
  })

  it('deduplicates extensions', () => {
    expect(parseExtraFileExtensions('srt,srt,SRT')).toEqual(['srt'])
  })

  it('caps the list length', () => {
    const raw = Array.from({ length: 30 }, (_, index) => `e${index}`).join(',')
    expect(parseExtraFileExtensions(raw)).toHaveLength(20)
  })
})

describe('settings-backed helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepos.settings.get.mockReset()
  })

  it('isMediaManageEnabled defaults to false', async () => {
    mockRepos.settings.get.mockResolvedValue(undefined)
    await expect(isMediaManageEnabled()).resolves.toBe(false)
  })

  it('getMediaImportMode falls back to hardlink', async () => {
    mockRepos.settings.get.mockResolvedValue(undefined)
    await expect(getMediaImportMode()).resolves.toBe('hardlink')
  })

  it('isImportExtraFilesEnabled defaults to false', async () => {
    mockRepos.settings.get.mockResolvedValue(undefined)
    await expect(isImportExtraFilesEnabled()).resolves.toBe(false)
  })

  it('getExtraFileExtensions returns the defaults when unset', async () => {
    mockRepos.settings.get.mockResolvedValue(undefined)
    await expect(getExtraFileExtensions()).resolves.toContain('srt')
  })

  it('getMediaConfig combines every media setting', async () => {
    mockRepos.settings.get.mockImplementation(async (key: string) => {
      if (key === 'media_manage_enabled') return 'true'
      if (key === 'media_import_mode') return 'copy'
      if (key === 'media_import_extra_files') return 'true'
      if (key === 'media_extra_file_extensions') return 'srt,nfo'
      return undefined
    })
    const config = await getMediaConfig()
    expect(config).toEqual({
      enabled: true,
      importMode: 'copy',
      importExtraFiles: true,
      extraFileExtensions: ['srt', 'nfo']
    })
  })
})
