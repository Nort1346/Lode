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

  it('searchTv stops early when a query returns a healthy result set', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValue(
      okJson([1, 2, 3, 4, 5].map((i) => release({ title: `R${i}`, size: i * 10 })))
    )
    const client = new ProwlarrClient('http://p', 'k')

    const results = await client.searchTv('Show', 'Show', '2020', null, 1)

    // season ladder: "Show S01 2020" already returns 5 -> no further queries
    expect(results).toHaveLength(5)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('searchTv includes alternative titles as extra ladder tiers', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockResolvedValue(okJson([]))
    const client = new ProwlarrClient('http://p', 'k')

    await client.searchTv('Show', 'Show', '2020', null, 1, undefined, ['Alt Title'])

    const queries = mockFetch.mock.calls.map(
      (call) => new URL(String(call[0])).searchParams.get('query') ?? ''
    )
    expect(queries).toEqual([
      'Show S01 2020',
      'Show S01',
      'Show',
      'Alt Title S01 2020',
      'Alt Title S01',
      'Alt Title'
    ])
  })

  it('searchMovie merges title, original title and alt title tiers', async () => {
    mockCacheGet.mockResolvedValue(null)
    mockFetch.mockImplementation(async (input: unknown) => {
      const query = new URL(String(input)).searchParams.get('query') ?? ''
      return okJson([release({ title: `Hit:${query}`, size: 10 })])
    })
    const client = new ProwlarrClient('http://p', 'k')

    const results = await client.searchMovie('Movie', 'Original Movie', ['Alt Movie'], '2020', [2000])

    expect(results.map((r) => r.title)).toEqual(
      expect.arrayContaining([
        'Hit:Movie 2020',
        'Hit:Movie',
        'Hit:Original Movie 2020',
        'Hit:Original Movie',
        'Hit:Alt Movie 2020',
        'Hit:Alt Movie'
      ])
    )
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
