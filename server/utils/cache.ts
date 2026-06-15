import Redis from 'ioredis'

let _redis: Redis | null = null
let _available = false

function getRedis(): Redis | null {
  const config = useRuntimeConfig()
  const url = config.redisUrl as string | undefined

  if (url === undefined || url === '') return null

  if (_redis === null) {
    try {
      _redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
        enableOfflineQueue: false
      })

      _redis.on('connect', () => {
        _available = true
      })

      _redis.on('error', () => {
        _available = false
      })

      _redis.connect().catch(() => {
        _available = false
      })
    } catch {
      _available = false
      return null
    }
  }

  return _available ? _redis : null
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  if (redis === null) return null

  try {
    const data = await redis.get(key)
    if (data === null) return null
    return JSON.parse(data) as T
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis()
  if (redis === null) return

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch {
    // cache write failed, ignore
  }
}

export const CACHE_TTL = {
  TMDB_SEARCH: 86400, // 24 hours
  TMDB_DETAILS: 604800, // 7 days
  PROWLARR_RESULTS: 1800, // 30 minutes
  TMDB_POPULAR: 21600 // 6 hours
} as const
