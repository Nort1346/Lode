import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRedisInstance, mockRedisCtor } = vi.hoisted(() => {
  const mockRedisInstance = {
    get: vi.fn(async (_key: string): Promise<unknown> => undefined),
    set: vi.fn(async (_key: string, _value: string, _mode: string, _ttl: number): Promise<unknown> => undefined),
    on: vi.fn((_event: string, _handler: () => void) => undefined),
    connect: vi.fn(async (): Promise<unknown> => undefined)
  }
  // A plain function so `new Redis(...)` in cache.ts can construct it
  const mockRedisCtor = vi.fn(function (_url: string, _opts: Record<string, unknown>) {
    return mockRedisInstance
  })
  return { mockRedisInstance, mockRedisCtor }
})

vi.mock('ioredis', () => ({
  default: mockRedisCtor
}))

let cache: typeof import('#server/utils/cache')

function fireRedisEvent(name: string) {
  const call = mockRedisInstance.on.mock.calls.find((c) => c[0] === name)
  ;(call?.[1] as ((..._args: unknown[]) => void) | undefined)?.()
}

async function warmUpAndConnect() {
  await cache.cacheGet('warmup')
  fireRedisEvent('connect')
}

describe('cache', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ redisUrl: 'redis://localhost:6379' }))
    )
    mockRedisCtor.mockClear()
    mockRedisInstance.connect.mockClear()
    mockRedisInstance.connect.mockResolvedValue(undefined)
    mockRedisInstance.get.mockReset()
    mockRedisInstance.set.mockReset()
    cache = await import('#server/utils/cache')
  })

  function stubRuntimeConfig(overrides: Record<string, unknown>) {
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ redisUrl: 'redis://localhost:6379', ...overrides }))
    )
  }

  describe('redis initialization', () => {
    it('does not connect when redisUrl is empty', async () => {
      stubRuntimeConfig({ redisUrl: '' })

      await cache.cacheGet('key')

      expect(mockRedisCtor).not.toHaveBeenCalled()
    })

    it('creates the client with safe connection options', async () => {
      await cache.cacheGet('key')

      expect(mockRedisCtor).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.objectContaining({ maxRetriesPerRequest: 1, lazyConnect: true, enableOfflineQueue: false })
      )
      expect(mockRedisInstance.on).toHaveBeenCalledWith('connect', expect.any(Function))
      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function))
    })

    it('returns null until the connect event has fired', async () => {
      mockRedisInstance.get.mockResolvedValue('"value"')

      const result = await cache.cacheGet('key')

      expect(result).toBeNull()
      expect(mockRedisInstance.get).not.toHaveBeenCalled()
    })
  })

  describe('cacheGet', () => {
    it('returns parsed JSON for an existing key', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify({ foo: 'bar' }))
      await warmUpAndConnect()

      const result = await cache.cacheGet<{ foo: string }>('test-key')

      expect(result).toEqual({ foo: 'bar' })
    })

    it('returns null when the key does not exist', async () => {
      mockRedisInstance.get.mockResolvedValue(null)
      await warmUpAndConnect()

      const result = await cache.cacheGet('missing')

      expect(result).toBeNull()
    })

    it('returns null when the stored value is not valid JSON', async () => {
      mockRedisInstance.get.mockResolvedValue('not-json')
      await warmUpAndConnect()

      const result = await cache.cacheGet('bad')

      expect(result).toBeNull()
    })

    it('returns null when the get call rejects', async () => {
      mockRedisInstance.get.mockRejectedValue(new Error('connection lost'))
      await warmUpAndConnect()

      const result = await cache.cacheGet('key')

      expect(result).toBeNull()
    })
  })

  describe('cacheSet', () => {
    it('stores the JSON-serialized value with an expiry', async () => {
      mockRedisInstance.set.mockResolvedValue('OK')
      await warmUpAndConnect()

      await cache.cacheSet('my-key', { data: 123 }, 300)

      expect(mockRedisInstance.set).toHaveBeenCalledWith('my-key', JSON.stringify({ data: 123 }), 'EX', 300)
    })

    it('swallows write failures', async () => {
      mockRedisInstance.set.mockRejectedValue(new Error('connection lost'))
      await warmUpAndConnect()

      await expect(cache.cacheSet('key', 'value', 60)).resolves.toBeUndefined()
    })

    it('is a no-op when redis is unavailable', async () => {
      await cache.cacheSet('key', 'value', 60)

      expect(mockRedisInstance.set).not.toHaveBeenCalled()
    })
  })

  describe('CACHE_TTL', () => {
    it('exposes the documented TTL values', () => {
      expect(cache.CACHE_TTL).toEqual({
        TMDB_SEARCH: 86400,
        TMDB_DETAILS: 604800,
        PROWLARR_RESULTS: 1800,
        TMDB_POPULAR: 21600,
        TMDB_GENRE: 21600
      })
    })
  })
})
