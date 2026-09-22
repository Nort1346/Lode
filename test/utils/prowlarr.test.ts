import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCacheGet = vi.hoisted(() => vi.fn())
const mockCacheSet = vi.hoisted(() => vi.fn())
const mockUseDbAsync = vi.hoisted(() => vi.fn())
const mockDbGet = vi.hoisted(() => vi.fn())
const mockDbAll = vi.hoisted(() => vi.fn())
const mockDecryptAES = vi.hoisted(() => vi.fn())
const mockPerformTrackerLogin = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/cache', () => ({
  cacheGet: mockCacheGet,
  cacheSet: mockCacheSet,
  CACHE_TTL: { PROWLARR_RESULTS: 600 }
}))

vi.mock('#server/database/schema', () => ({
  customTrackers: {
    indexerName: 'indexerName',
    trackerType: 'trackerType',
    enabled: 'enabled',
    loginUrl: 'loginUrl',
    loginUsername: 'loginUsername',
    loginPassword: 'loginPassword',
    cookie: 'cookie'
  }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val }))
}))

vi.mock('#server/utils/crypto', () => ({
  decryptAES: mockDecryptAES
}))

vi.mock('#server/utils/tracker-auth', () => ({
  performTrackerLogin: mockPerformTrackerLogin
}))

vi.mock('#server/utils/db', () => ({
  useDbAsync: mockUseDbAsync,
  dbGet: mockDbGet,
  dbAll: mockDbAll
}))

import {
  ProwlarrClient,
  getTrackerType,
  getTrackerCookieConfig,
  isPrivateTracker,
  getEnabledCustomTrackerNames,
  useProwlarr
} from '#server/utils/prowlarr'

const fakeDb = { select: () => ({ from: () => ({ where: () => ({}) }) }) }

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

function rateLimited(retryAfter: string | null) {
  return {
    ok: false,
    status: 429,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'retry-after' ? retryAfter : null)
    },
    json: async () => ({})
  } as unknown as Response
}

function release(over: Record<string, unknown> = {}) {
  return {
    title: 'T',
    indexer: 'Tr',
    size: 100,
    seeders: 1,
    leechers: 0,
    magnetUrl: 'magnet:x',
    downloadUrl: null,
    guid: null,
    publishDate: '2024-01-01',
    categories: [],
    infoUrl: '',
    imdbId: null,
    ...over
  }
}

describe('getTrackerType', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns guid for polish trackers without a db lookup', async () => {
    await expect(getTrackerType('Devil-Torrents')).resolves.toBe('guid')
    expect(mockUseDbAsync).not.toHaveBeenCalled()
  })

  it('returns the row tracker type for a custom tracker', async () => {
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDbGet.mockResolvedValue({ trackerType: 'guid', enabled: true })

    await expect(getTrackerType('MyTracker')).resolves.toBe('guid')
  })

  it('returns null when the tracker is not stored', async () => {
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDbGet.mockResolvedValue(undefined)

    await expect(getTrackerType('Unknown')).resolves.toBeNull()
  })
})

describe('getTrackerCookieConfig', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns an empty cookie for counting trackers', async () => {
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDbGet.mockResolvedValue({ trackerType: 'counting', enabled: true, cookie: 'x' })

    await expect(getTrackerCookieConfig('C', {})).resolves.toEqual({ enabled: true, cookie: '' })
  })

  it('decrypts the password and performs auto-login when credentials are present', async () => {
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDecryptAES.mockReturnValue('plain')
    mockPerformTrackerLogin.mockResolvedValue('sess=abc')
    mockDbGet.mockResolvedValue({
      trackerType: 'guid',
      enabled: true,
      loginUrl: 'http://login',
      loginUsername: 'u',
      loginPassword: 'enc',
      cookie: 'ignored'
    })

    await expect(getTrackerCookieConfig('P', {})).resolves.toEqual({ enabled: true, cookie: 'sess=abc' })
    expect(mockDecryptAES).toHaveBeenCalledWith('enc')
    expect(mockPerformTrackerLogin).toHaveBeenCalledWith('http://login', 'u', 'plain')
  })

  it('rethrows auto-login failures with a descriptive message', async () => {
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDecryptAES.mockReturnValue('plain')
    mockPerformTrackerLogin.mockRejectedValue(new Error('nope'))
    mockDbGet.mockResolvedValue({
      trackerType: 'guid',
      enabled: true,
      loginUrl: 'http://login',
      loginUsername: 'u',
      loginPassword: 'enc',
      cookie: 'x'
    })

    await expect(getTrackerCookieConfig('P', {})).rejects.toThrow('Auto-login failed for P')
  })

  it('falls back to the stored cookie when no login credentials are set', async () => {
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDbGet.mockResolvedValue({
      trackerType: 'guid',
      enabled: false,
      loginUrl: null,
      loginUsername: null,
      loginPassword: null,
      cookie: 'stored'
    })

    await expect(getTrackerCookieConfig('P', {})).resolves.toEqual({ enabled: false, cookie: 'stored' })
  })

  it('uses the built-in Devil-Torrents env config when no row exists', async () => {
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDbGet.mockResolvedValue(undefined)

    await expect(getTrackerCookieConfig('Devil-Torrents', { trackerDevilCookie: 'abc' })).resolves.toEqual({
      enabled: true,
      cookie: 'abc'
    })
  })

  it('returns null for an unknown non-polish indexer with no row', async () => {
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDbGet.mockResolvedValue(undefined)

    await expect(getTrackerCookieConfig('Nobody', {})).resolves.toBeNull()
  })
})

describe('isPrivateTracker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is always private for polish trackers', async () => {
    await expect(isPrivateTracker('Polskie-Torrenty')).resolves.toBe(true)
    expect(mockUseDbAsync).not.toHaveBeenCalled()
  })

  it('is private when the custom row is enabled', async () => {
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDbGet.mockResolvedValue({ enabled: true })

    await expect(isPrivateTracker('Tr')).resolves.toBe(true)
  })

  it('is not private when no row exists', async () => {
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDbGet.mockResolvedValue(undefined)

    await expect(isPrivateTracker('Tr')).resolves.toBe(false)
  })
})

describe('getEnabledCustomTrackerNames', () => {
  it('maps enabled rows to their indexer names', async () => {
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDbAll.mockResolvedValue([{ indexerName: 'A' }, { indexerName: 'B' }])

    await expect(getEnabledCustomTrackerNames()).resolves.toEqual(['A', 'B'])
  })
})

describe('ProwlarrClient', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockDbAll.mockResolvedValue([])
    mockDbGet.mockResolvedValue(undefined)
  })

  it('returns cached results without calling the api', async () => {
    mockCacheGet.mockResolvedValue([{ title: 'cached' }])
    const client = new ProwlarrClient('http://p', 'k')

    await expect(client.searchByImdb('tt1', 'movie')).resolves.toEqual([{ title: 'cached' }])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('searchByImdb dedupes by download url and sends categories', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce(
      okJson([release({ seeders: 3, downloadUrl: 'u1' }), release({ seeders: 9, downloadUrl: 'u1' })])
    )
    const client = new ProwlarrClient('http://p', 'k')

    const results = await client.searchByImdb('tt1', 'movie', [2000])

    expect(results).toHaveLength(1)
    expect(results[0]?.seeders).toBe(9)
    expect(mockCacheSet).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0]?.[0]).toContain('categories=2000')
  })

  it('searchByQuery dedupes by title and size preferring magnet over seeders', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce(
      okJson([
        release({ title: 'Y', size: 200, magnetUrl: null, downloadUrl: 'u1', seeders: 99 }),
        release({ title: 'Y', size: 200, magnetUrl: 'magnet:y', downloadUrl: 'u2', seeders: 1 })
      ])
    )
    const client = new ProwlarrClient('http://p', 'k')

    const results = await client.searchByQuery('Y')

    expect(results).toHaveLength(1)
    expect(results[0]?.magnetLink).toBe('magnet:y')
  })

  it('searchByQuery filters out non-downloadable releases', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce(
      okJson([
        release({ title: 'Z', size: 50, magnetUrl: 'm', downloadUrl: null }),
        release({ title: 'W', size: 60, magnetUrl: null, downloadUrl: null })
      ])
    )
    const client = new ProwlarrClient('http://p', 'k')

    const results = await client.searchByQuery('Z')

    expect(results).toHaveLength(1)
    expect(results[0]?.title).toBe('Z')
    expect(mockCacheSet).toHaveBeenCalledTimes(1)
  })

  it('searchByQuery does not cache empty results', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce(okJson([]))
    const client = new ProwlarrClient('http://p', 'k')

    await expect(client.searchByQuery('nothing')).resolves.toEqual([])
    expect(mockCacheSet).not.toHaveBeenCalled()
  })

  it('searchTv merges text results and tolerates an imdb failure', async () => {
    mockCacheGet.mockResolvedValue(null)
    const fail = { ok: false, status: 500, json: async () => ({}) } as unknown as Response
    mockFetch.mockImplementation(async (input: unknown) =>
      String(input).includes('imdbid') ? fail : okJson([release({ title: 'TextHit', size: 10 })])
    )
    const client = new ProwlarrClient('http://p', 'k')

    const results = await client.searchTv('Show', 'Show', '2020', 'tt1', null)

    expect(results.map((r) => r.title)).toContain('TextHit')
    // each text ladder query caches its own result, then searchTv caches the merged result
    expect(mockCacheSet).toHaveBeenCalledTimes(3)
  })

  it('searchByImdb does not cache empty results', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValueOnce(okJson([]))
    const client = new ProwlarrClient('http://p', 'k')

    await expect(client.searchByImdb('tt1', 'tv')).resolves.toEqual([])
    expect(mockCacheSet).not.toHaveBeenCalled()
  })

  it('searchTv merges sparse ladder queries instead of stopping at the first hit', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockImplementation(async (input: unknown) => {
      const query = new URL(String(input)).searchParams.get('query') ?? ''
      return okJson([release({ title: `Hit:${query}`, size: 10 })])
    })
    const client = new ProwlarrClient('http://p', 'k')

    const results = await client.searchTv('Show', 'Show', '2020', null, null)

    // the old first-non-empty behavior kept only "Show 2020"; the broader
    // "Show" query must contribute to the pool as well
    expect(results.map((r) => r.title)).toEqual(expect.arrayContaining(['Hit:Show 2020', 'Hit:Show']))
  })

  it('skips the queued ladder query once a healthy set arrives', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValue(
      okJson([1, 2, 3, 4, 5].map((i) => release({ title: `R${i}`, size: i * 10 })))
    )
    const client = new ProwlarrClient('http://p', 'k')

    const results = await client.searchTv('Show', 'Orig', '2020', null, 1, undefined, ['Alt'])

    // 3 names x 2 (per-name cap) = 6 -> capped to 4; 3 run in parallel and all
    // return a healthy set (5), so the 4th query, still waiting for a slot, is
    // skipped
    expect(results).toHaveLength(5)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('caps the season ladder at two queries per name and four in total', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValue(okJson([]))
    const client = new ProwlarrClient('http://p', 'k')

    await client.searchTv('Show', 'Orig', '2020', null, 1, undefined, ['Alt'])

    const queries = mockFetch.mock.calls.map(
      (call) => new URL(String(call[0])).searchParams.get('query') ?? ''
    )
    // per-name cap keeps most-specific + bare name; the total cap keeps the
    // first 4 (the alt-title tier is cut)
    expect(queries).toEqual(['Show S01 2020', 'Show', 'Orig S01 2020', 'Orig'])
  })

  it('searchMovie caps the ladder at the total query limit', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockImplementation(async (input: unknown) => {
      const query = new URL(String(input)).searchParams.get('query') ?? ''
      return okJson([release({ title: `Hit:${query}`, size: 10 })])
    })
    const client = new ProwlarrClient('http://p', 'k')

    const results = await client.searchMovie('Movie', 'Original Movie', ['Alt Movie'], '2020', [2000])

    // 3 names x 2 tiers = 6 queries -> capped to 4: the alt-title tier is the
    // first to go, the top names keep both of their queries
    const queries = mockFetch.mock.calls.map(
      (call) => new URL(String(call[0])).searchParams.get('query') ?? ''
    )
    expect(queries).toEqual(['Movie 2020', 'Movie', 'Original Movie 2020', 'Original Movie'])
    expect(results.map((r) => r.title)).toEqual(
      expect.arrayContaining(['Hit:Movie 2020', 'Hit:Movie', 'Hit:Original Movie 2020', 'Hit:Original Movie'])
    )
  })

  it('searchMovie includes alt titles in the pool when under the cap', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockImplementation(async (input: unknown) => {
      const query = new URL(String(input)).searchParams.get('query') ?? ''
      return okJson([release({ title: `Hit:${query}`, size: 10 })])
    })
    const client = new ProwlarrClient('http://p', 'k')

    const results = await client.searchMovie('Movie', 'Movie', ['Alt Movie'], '2020', [2000])

    const queries = mockFetch.mock.calls.map(
      (call) => new URL(String(call[0])).searchParams.get('query') ?? ''
    )
    expect(queries).toEqual(['Movie 2020', 'Movie', 'Alt Movie 2020', 'Alt Movie'])
    expect(results.map((r) => r.title)).toEqual(
      expect.arrayContaining(['Hit:Movie 2020', 'Hit:Movie', 'Hit:Alt Movie 2020', 'Hit:Alt Movie'])
    )
  })

  it('bounds total ladder latency by the concurrency cap, not the sequential sum', async () => {
    mockCacheGet.mockResolvedValue(null)
    const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
    mockFetch.mockImplementation(async () => {
      await delay(80)
      return okJson([release({ title: 'Slow', size: 1 })])
    })
    const client = new ProwlarrClient('http://p', 'k')

    const started = Date.now()
    // 4 capped queries of 80ms each: sequential would take >= 320ms, the
    // 3-slot pool takes ~2 waves
    await client.searchTv('Show', 'Orig', '2020', null, 1, undefined, ['Alt'])
    const elapsed = Date.now() - started

    expect(elapsed).toBeLessThan(300)
    expect(elapsed).toBeGreaterThanOrEqual(150)
  })

  it('keeps in-flight Prowlarr requests at or below the concurrency limit', async () => {
    mockCacheGet.mockResolvedValue(null)
    let inFlight = 0
    let maxInFlight = 0
    mockFetch.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise<void>((resolve) => setTimeout(resolve, 40))
      inFlight -= 1
      return okJson([release({ title: 'C', size: 1 })])
    })
    const client = new ProwlarrClient('http://p', 'k')

    await client.searchTv('Show', 'Orig', '2020', null, 1, undefined, ['Alt'])

    // 4 capped queries through the 3-slot pool: some overlap (not serialized)
    // but never more than 3 at once
    expect(maxInFlight).toBe(3)
  })

  it('does not fail the whole search when a single ladder query errors', async () => {
    mockCacheGet.mockResolvedValue(null)
    const fail = { ok: false, status: 500, json: async () => ({}) } as unknown as Response
    mockFetch.mockImplementation(async (input: unknown) =>
      String(input).includes('Bad') ? fail : okJson([release({ title: 'Good', size: 1 })])
    )
    const client = new ProwlarrClient('http://p', 'k')

    const results = await client.searchTv('Good Show', 'Bad Show', '2020', null, null)

    expect(results.map((r) => r.title)).toContain('Good')
  })

  it('backs off on 429 and retries once', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch
      .mockResolvedValueOnce(rateLimited('0'))
      .mockResolvedValueOnce(okJson([release({ title: 'R', size: 1 })]))
    const client = new ProwlarrClient('http://p', 'k')

    const results = await client.searchByQuery('X')

    expect(results).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('gives up after one 429 retry instead of retrying forever', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValue(rateLimited('0'))
    const client = new ProwlarrClient('http://p', 'k')

    await expect(client.searchByQuery('X')).rejects.toThrow('Prowlarr API error 429')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

describe('useProwlarr', () => {
  it('returns null when the url or api key is missing', () => {
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ prowlarrUrl: '', prowlarrApiKey: 'k' }))
    )

    expect(useProwlarr()).toBeNull()
  })
})
