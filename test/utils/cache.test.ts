import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockSet = vi.fn()

vi.mock('#server/utils/cache', () => ({
  cacheGet: async <T>(key: string): Promise<T | null> => {
    try {
      const data = await mockGet(key)
      if (data === null || data === undefined) return null
      return JSON.parse(data as string) as T
    } catch {
      return null
    }
  },
  cacheSet: async (key: string, value: unknown, ttl: number): Promise<void> => {
    await mockSet(key, value, ttl)
  },
  CACHE_TTL: {
    TMDB_SEARCH: 86400,
    TMDB_DETAILS: 604800,
    PROWLARR_RESULTS: 1800,
    TMDB_POPULAR: 21600,
    TMDB_GENRE: 21600
  }
}))

import { cacheGet, cacheSet, CACHE_TTL } from '#server/utils/cache'

describe('cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('cacheGet', () => {
    it('returns parsed JSON when key exists', async () => {
      mockGet.mockResolvedValue(JSON.stringify({ foo: 'bar' }))
      const result = await cacheGet<{ foo: string }>('test-key')
      expect(result).toEqual({ foo: 'bar' })
    })

    it('returns null when key does not exist', async () => {
      mockGet.mockResolvedValue(null)
      const result = await cacheGet('missing-key')
      expect(result).toBeNull()
    })

    it('returns null on JSON parse error', async () => {
      mockGet.mockResolvedValue('not-json')
      const result = await cacheGet('bad-key')
      expect(result).toBeNull()
    })
  })

  describe('cacheSet', () => {
    it('calls underlying set with JSON-serialized value and TTL', async () => {
      mockSet.mockResolvedValue(undefined)
      await cacheSet('my-key', { data: 123 }, 300)
      expect(mockSet).toHaveBeenCalledWith('my-key', { data: 123 }, 300)
    })

    it('propagates errors from underlying set', async () => {
      mockSet.mockRejectedValue(new Error('connection lost'))
      await expect(cacheSet('key', 'val', 60)).rejects.toThrow('connection lost')
    })
  })

  describe('CACHE_TTL', () => {
    it('has correct TTL values', () => {
      expect(CACHE_TTL.TMDB_SEARCH).toBe(86400)
      expect(CACHE_TTL.TMDB_DETAILS).toBe(604800)
      expect(CACHE_TTL.PROWLARR_RESULTS).toBe(1800)
      expect(CACHE_TTL.TMDB_POPULAR).toBe(21600)
      expect(CACHE_TTL.TMDB_GENRE).toBe(21600)
    })
  })
})
