import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetMovieDetails = vi.hoisted(() => vi.fn())
const mockGetTvShowDetails = vi.hoisted(() => vi.fn())
const mockGetSeasonDetails = vi.hoisted(() => vi.fn())
const mockGetImageUrl = vi.hoisted(() => vi.fn())
const mockUseProwlarr = vi.hoisted(() => vi.fn())
const mockRankTorrents = vi.hoisted(() => vi.fn())
const mockGetRankingConfig = vi.hoisted(() => vi.fn())

vi.stubGlobal(
  'formatSize',
  vi.fn((bytes: number) => `${bytes} B`)
)

vi.mock('#server/utils/tmdb', () => ({
  getMovieDetails: mockGetMovieDetails,
  getTvShowDetails: mockGetTvShowDetails,
  getSeasonDetails: mockGetSeasonDetails,
  getImageUrl: mockGetImageUrl
}))

vi.mock('#server/utils/prowlarr', () => ({
  useProwlarr: mockUseProwlarr,
  PROWLARR_CATEGORIES: { MOVIES: 2000, TV: 5000 }
}))

vi.mock('#server/utils/torrents/torrent-ranker', () => ({
  rankTorrents: mockRankTorrents
}))

vi.mock('#server/utils/torrents/ranking-config', () => ({
  getRankingConfig: mockGetRankingConfig
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}))

import { searchMovieTorrents, searchSeasonTorrents, toStreamEvent } from '#server/utils/torrents/torrent-search'
import type { ProwlarrProgressEvent } from '#server/types/prowlarr'

function rawRelease(over: Record<string, unknown> = {}) {
  return {
    title: 'T',
    indexer: 'Tr',
    size: 100,
    seeders: 1,
    leechers: 0,
    magnetLink: 'magnet:x',
    downloadUrl: null,
    guid: null,
    publishDate: '2024-01-01',
    categories: [],
    infoUrl: '',
    imdbId: null,
    isPrivate: false,
    ...over
  }
}

function rankedRelease(over: Record<string, unknown> = {}) {
  return {
    ...rawRelease(over),
    score: 90,
    percentage: 90,
    recommended: true,
    parsed: { resolution: '1080p', source: 'WEB', language: 'PL-DUB', group: 'GRP' },
    isSeasonPack: false
  }
}

describe('searchMovieTorrents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMovieDetails.mockResolvedValue({
      id: 1,
      title: 'Movie',
      original_title: 'Movie',
      release_date: '2024-01-01'
    })
    mockGetRankingConfig.mockResolvedValue({})
    mockRankTorrents.mockReturnValue([])
    mockUseProwlarr.mockReturnValue(null)
  })

  it('returns details-failed when TMDB rejects', async () => {
    mockGetMovieDetails.mockRejectedValue(new Error('tmdb down'))

    await expect(searchMovieTorrents(1, 'en')).resolves.toEqual({ kind: 'details-failed' })
  })

  it('returns an empty payload when Prowlarr is not configured', async () => {
    const outcome = await searchMovieTorrents(1, 'en')

    expect(outcome.kind).toBe('ok')
    if (outcome.kind === 'ok') {
      expect(outcome.payload).toEqual({ torrents: [] })
      expect(outcome.found).toBe(0)
    }
    expect(mockRankTorrents).not.toHaveBeenCalled()
  })

  it('swallows Prowlarr failures into an empty payload', async () => {
    const mockClient = { searchMovie: vi.fn().mockRejectedValue(new Error('offline')) }
    mockUseProwlarr.mockReturnValue(mockClient)

    const outcome = await searchMovieTorrents(1, 'en')

    expect(outcome.kind).toBe('ok')
    if (outcome.kind === 'ok') {
      expect(outcome.payload.torrents).toEqual([])
      expect(outcome.found).toBe(0)
    }
  })

  it('maps ranked torrents and forwards the progress callback', async () => {
    const events: ProwlarrProgressEvent[] = []
    const mockClient = {
      searchMovie: vi.fn((...args: unknown[]) => {
        const cb = args[5] as (e: ProwlarrProgressEvent) => void
        cb({ kind: 'start', queries: 1 })
        return Promise.resolve([rawRelease({ title: 'raw' })])
      })
    }
    mockUseProwlarr.mockReturnValue(mockClient)
    mockRankTorrents.mockReturnValue([rankedRelease({ title: 'Ranked' })])

    const outcome = await searchMovieTorrents(1, 'pl', (e) => events.push(e))

    expect(mockClient.searchMovie).toHaveBeenCalledWith('Movie', 'Movie', [], '2024', [2000], expect.any(Function))
    expect(outcome.kind).toBe('ok')
    if (outcome.kind === 'ok') {
      expect(outcome.found).toBe(1)
      expect(outcome.payload.torrents).toEqual([
        expect.objectContaining({ title: 'Ranked', sizeFormatted: '100 B', resolution: '1080p', source: 'WEB' })
      ])
    }
    expect(events).toEqual([{ kind: 'start', queries: 1 }])
  })
})

describe('searchSeasonTorrents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTvShowDetails.mockResolvedValue({
      id: 2,
      name: 'Show',
      original_name: 'Show',
      first_air_date: '2024-01-01',
      external_ids: { imdb_id: null }
    })
    mockGetSeasonDetails.mockResolvedValue({
      season_number: 1,
      name: 'Season 1',
      overview: '',
      poster_path: null,
      air_date: null,
      episodes: [
        {
          id: 10,
          episode_number: 1,
          name: 'Pilot',
          overview: '',
          still_path: null,
          air_date: null,
          vote_average: 8,
          runtime: 45
        }
      ]
    })
    mockGetImageUrl.mockImplementation((path: string | null) => (path ? `img:${path}` : null))
    mockGetRankingConfig.mockResolvedValue({})
    mockRankTorrents.mockImplementation((torrents: unknown[]) => torrents)
    mockUseProwlarr.mockReturnValue(null)
  })

  it('returns details-failed when TMDB rejects', async () => {
    mockGetSeasonDetails.mockRejectedValue(new Error('tmdb down'))

    await expect(searchSeasonTorrents(2, 1, 'en')).resolves.toEqual({ kind: 'details-failed' })
  })

  it('returns an empty payload when Prowlarr is not configured', async () => {
    const outcome = await searchSeasonTorrents(2, 1, 'en')

    expect(outcome.kind).toBe('ok')
    if (outcome.kind === 'ok') {
      expect(outcome.payload.episodes).toHaveLength(1)
      expect(outcome.payload.episodes[0]?.torrents).toEqual([])
      expect(outcome.payload.seasonPacks).toEqual([])
      expect(outcome.found).toBe(0)
    }
  })

  it('retries with the original name and forwards progress to both searches', async () => {
    mockGetTvShowDetails.mockResolvedValue({
      id: 2,
      name: 'English Name',
      original_name: 'Original Name',
      first_air_date: '2024-01-01',
      external_ids: { imdb_id: null }
    })
    const events: ProwlarrProgressEvent[] = []
    const mockClient = {
      searchTv: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockImplementationOnce((...args: unknown[]) => {
          const cb = args[7] as (e: ProwlarrProgressEvent) => void
          cb({ kind: 'start', queries: 1 })
          cb({ kind: 'query', state: 'done', index: 1, total: 1, text: 'Original Name', results: 1 })
          return Promise.resolve([rawRelease({ title: 'Show.S01E01.1080p' })])
        })
    }
    mockUseProwlarr.mockReturnValue(mockClient)
    mockRankTorrents.mockImplementation((torrents: unknown[]) =>
      (torrents as Array<ReturnType<typeof rawRelease>>).map((t) => rankedRelease(t))
    )

    const outcome = await searchSeasonTorrents(2, 1, 'en', (e) => events.push(e))

    expect(mockClient.searchTv).toHaveBeenCalledTimes(2)
    expect(mockClient.searchTv).toHaveBeenNthCalledWith(
      1,
      'English Name',
      'Original Name',
      '2024',
      null,
      1,
      expect.anything(),
      expect.anything(),
      expect.any(Function)
    )
    expect(mockClient.searchTv).toHaveBeenNthCalledWith(
      2,
      'Original Name',
      'English Name',
      '2024',
      null,
      1,
      expect.anything(),
      expect.anything(),
      expect.any(Function)
    )
    expect(outcome.kind).toBe('ok')
    if (outcome.kind === 'ok') {
      expect(outcome.found).toBe(1)
      // the episode torrent is matched to episode 1
      expect(outcome.payload.episodes[0]?.torrents).toHaveLength(1)
    }
    // progress from the second (retry) search is forwarded
    expect(events.filter((e) => e.kind === 'query' && e.state === 'done')).toHaveLength(1)
  })

  it('classifies season packs with the seasonPack rank kind', async () => {
    const mockClient = {
      searchTv: vi.fn().mockResolvedValue([rawRelease({ title: 'Show.S01.Complete.1080p' })])
    }
    mockUseProwlarr.mockReturnValue(mockClient)
    mockRankTorrents.mockImplementation((torrents: unknown[]) =>
      (torrents as Array<ReturnType<typeof rawRelease>>).map((t) => ({
        ...rankedRelease(t),
        isSeasonPack: false
      }))
    )

    const outcome = await searchSeasonTorrents(2, 1, 'en')

    const calls = mockRankTorrents.mock.calls as Array<Array<unknown>>
    const packCall = calls.find((call) =>
      (call[0] as Array<{ title: string }> | undefined)?.some((t) => t.title === 'Show.S01.Complete.1080p')
    )
    expect(packCall?.[1]).toBe('seasonPack')
    expect(outcome.kind).toBe('ok')
    if (outcome.kind === 'ok') {
      expect(outcome.payload.seasonPacks).toHaveLength(1)
      expect(outcome.payload.seasonPacks[0]?.isSeasonPack).toBe(false)
    }
  })
})

describe('toStreamEvent', () => {
  it('maps progress events onto the wire schema', () => {
    expect(toStreamEvent({ kind: 'start', queries: 3 })).toEqual({ type: 'start', queries: 3 })
    expect(toStreamEvent({ kind: 'query', state: 'start', index: 1, total: 3, text: 'Q' })).toEqual({
      type: 'query',
      state: 'start',
      index: 1,
      total: 3,
      text: 'Q'
    })
    expect(toStreamEvent({ kind: 'query', state: 'done', index: 1, total: 3, text: 'Q', results: 2 })).toEqual({
      type: 'query',
      state: 'done',
      index: 1,
      total: 3,
      text: 'Q',
      results: 2
    })
    expect(toStreamEvent({ kind: 'imdb', results: 4 })).toEqual({ type: 'imdb', results: 4 })
  })
})
