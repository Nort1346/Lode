import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetRouterParam = vi.fn()
const mockGetQuery = vi.fn()
const mockFormatSize = vi.fn()
const mockGetTvShowDetails = vi.hoisted(() => vi.fn())
const mockUseProwlarr = vi.hoisted(() => vi.fn())
const mockRankTorrents = vi.hoisted(() => vi.fn())
const mockCheckDailyLimit = vi.hoisted(() => vi.fn())
const mockGetRankingConfig = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getRouterParam', mockGetRouterParam)
vi.stubGlobal('getQuery', mockGetQuery)
vi.stubGlobal('formatSize', mockFormatSize)

vi.mock('#server/utils/tmdb', () => ({
  getTvShowDetails: mockGetTvShowDetails
}))

vi.mock('#server/utils/prowlarr', () => ({
  useProwlarr: mockUseProwlarr,
  PROWLARR_CATEGORIES: { MOVIES: 2000, TV: 5000 }
}))

vi.mock('#server/utils/torrents/torrent-ranker', () => ({
  rankTorrents: mockRankTorrents
}))

vi.mock('#server/utils/limits', () => ({
  checkDailyLimit: mockCheckDailyLimit
}))

vi.mock('#server/utils/torrents/ranking-config', () => ({
  getRankingConfig: mockGetRankingConfig
}))

import handler from '#server/api/browse/tv/[id]/torrents.get'

const mockEvent = {} as never
const mockClient = { searchTv: vi.fn() }

function ranked() {
  return {
    title: 'Ranked',
    size: 2000,
    seeders: 7,
    leechers: 2,
    indexer: 'Tr',
    magnetLink: 'magnet:y',
    downloadUrl: null,
    guid: null,
    score: 70,
    percentage: 70,
    recommended: false,
    parsed: { resolution: '720p', source: 'HDTV', language: 'PL' },
    isPrivate: true
  }
}

describe('browse/tv/[id]/torrents.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetRouterParam.mockReturnValue('456')
    mockGetQuery.mockReturnValue({})
    mockCheckDailyLimit.mockResolvedValue({ reached: false, activeCount: 0, todayCount: 0, limit: 10 })
    mockGetRankingConfig.mockResolvedValue({})
    mockFormatSize.mockImplementation((bytes: number) => `${bytes} B`)
    mockRankTorrents.mockReturnValue([])
    mockUseProwlarr.mockReturnValue(null)
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })

  it('throws 400 for an invalid TV show id', async () => {
    mockGetRouterParam.mockReturnValue('nope')

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid TV show ID')
  })

  it('throws 429 when the daily limit is reached', async () => {
    mockCheckDailyLimit.mockResolvedValue({ reached: true, activeCount: 3, todayCount: 9, limit: 10 })

    await expect(handler(mockEvent)).rejects.toThrow('429')
  })

  it('throws 502 when TMDB details fail', async () => {
    mockGetTvShowDetails.mockRejectedValue(new Error('tmdb down'))

    await expect(handler(mockEvent)).rejects.toThrow('502: Failed to fetch TV show details from TMDB')
  })

  it('returns empty torrents when Prowlarr is not configured', async () => {
    mockGetTvShowDetails.mockResolvedValue({
      id: 456,
      name: 'Show',
      original_name: 'Show',
      first_air_date: '2020-02-02'
    })

    const result = await handler(mockEvent)

    expect(result).toEqual({ torrents: [] })
    expect(mockClient.searchTv).not.toHaveBeenCalled()
  })

  it('maps ranked torrents and searches Prowlarr as a series', async () => {
    mockUseProwlarr.mockReturnValue(mockClient)
    mockClient.searchTv.mockResolvedValue([{ title: 'raw' }])
    mockRankTorrents.mockReturnValue([ranked()])
    mockGetTvShowDetails.mockResolvedValue({
      id: 456,
      name: 'Show',
      original_name: 'Show',
      first_air_date: '2020-02-02',
      external_ids: { imdb_id: 'tt9' }
    })

    const result = await handler(mockEvent)

    expect(result.torrents).toHaveLength(1)
    expect(result.torrents[0]).toMatchObject({
      title: 'Ranked',
      sizeFormatted: '2000 B',
      resolution: '720p',
      isPrivate: true
    })
    expect(mockClient.searchTv).toHaveBeenCalledWith('Show', 'Show', '2020', 'tt9', null, [5000])
    expect(mockRankTorrents).toHaveBeenCalledWith([{ title: 'raw' }], 'series', 'Show', '2020', {})
  })

  it('retries with the original name when the first search is empty', async () => {
    mockUseProwlarr.mockReturnValue(mockClient)
    mockClient.searchTv.mockResolvedValueOnce([]).mockResolvedValueOnce([{ title: 'raw2' }])
    mockRankTorrents.mockReturnValue([ranked()])
    mockGetTvShowDetails.mockResolvedValue({
      id: 456,
      name: 'English Show',
      original_name: 'Original Show',
      first_air_date: '2020-03-03',
      external_ids: { imdb_id: 'tt9' }
    })

    await handler(mockEvent)

    expect(mockClient.searchTv).toHaveBeenCalledTimes(2)
    expect(mockClient.searchTv).toHaveBeenLastCalledWith('Original Show', 'English Show', '2020', 'tt9', null, [5000])
  })
})
