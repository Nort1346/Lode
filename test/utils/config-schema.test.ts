import { describe, it, expect } from 'vitest'
import { configSchema } from '#server/utils/config-schema'

const BASE_CONFIG = {
  savePathMovies: '/data/Movies',
  savePathSeries: '/data/Series',
  sessionPassword: 'a'.repeat(32),
  trackerEncryptionKey: 'a'.repeat(64),
  tmdbApiKey: 'test-tmdb-key',
  prowlarrApiKey: 'test-prowlarr-key',
  qbittorrentUrl: 'http://localhost:8080',
  qbittorrentApiKey: 'test-qbit-key'
}

describe('configSchema', () => {
  it('accepts valid config with all required fields', () => {
    const result = configSchema.safeParse(BASE_CONFIG)
    expect(result.success).toBe(true)
  })

  it('rejects sessionPassword shorter than 32 chars', () => {
    const result = configSchema.safeParse({ ...BASE_CONFIG, sessionPassword: 'a'.repeat(31) })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('sessionPassword'))).toBe(true)
    }
  })

  it('accepts trackerEncryptionKey as any non-empty string', () => {
    const result = configSchema.safeParse({ ...BASE_CONFIG, trackerEncryptionKey: 'any-key' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid qbittorrentUrl', () => {
    const result = configSchema.safeParse({ ...BASE_CONFIG, qbittorrentUrl: 'not-a-url' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('qbittorrentUrl'))).toBe(true)
    }
  })

  it('accepts valid qbittorrentUrl', () => {
    const result = configSchema.safeParse({ ...BASE_CONFIG, qbittorrentUrl: 'http://qbittorrent:8080' })
    expect(result.success).toBe(true)
  })

  it('uses default qbittorrentUrl when not provided', () => {
    const { qbittorrentUrl: _, ...noUrl } = BASE_CONFIG
    const result = configSchema.safeParse(noUrl)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.qbittorrentUrl).toBe('http://localhost:8080')
    }
  })

  it('accepts optional fields as empty', () => {
    const result = configSchema.safeParse({
      ...BASE_CONFIG,
      jellyfinUrl: '',
      jellyfinApiKey: ''
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty savePathMovies', () => {
    const result = configSchema.safeParse({ ...BASE_CONFIG, savePathMovies: '' })
    expect(result.success).toBe(false)
  })
})
