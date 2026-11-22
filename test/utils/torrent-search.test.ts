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
      expect(outcome.payload).toEqual({ torrents: [], otherTorrents: [] })
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

    expect(mockClient.searchMovie).toHaveBeenCalledWith(
      'Movie',
      'Movie',
      [],
      '2024',
      [2000],
      expect.any(Function),
      undefined
    )
    expect(outcome.kind).toBe('ok')
    if (outcome.kind === 'ok') {
      expect(outcome.found).toBe(1)
      expect(outcome.payload.torrents).toEqual([
        expect.objectContaining({ title: 'Ranked', sizeFormatted: '100 B', resolution: '1080p', source: 'WEB' })
      ])
    }
    expect(events).toEqual([{ kind: 'start', queries: 1 }])
  })

  it('passes every TMDB title to the ranker and keeps every Prowlarr result', async () => {
    const raw = [rawRelease({ title: 'Movie.2024.1080p' }), rawRelease({ title: 'Movie.Squad.1973.1080p', size: 200 })]
    const mockClient = { searchMovie: vi.fn().mockResolvedValue(raw) }
    mockUseProwlarr.mockReturnValue(mockClient)
    mockGetMovieDetails.mockResolvedValue({
      id: 1,
      title: 'Movie',
      original_title: 'Film',
      imdb_id: 'tt1',
      release_date: '2024-01-01',
      alternative_titles: [{ title: 'Alt Movie' }]
    })
    mockRankTorrents.mockImplementation((torrents: unknown[]) =>
      (torrents as Array<ReturnType<typeof rawRelease>>).map((t) => rankedRelease(t))
    )

    const outcome = await searchMovieTorrents(1, 'en')

    expect(mockClient.searchMovie).toHaveBeenCalledWith(
      'Movie',
      'Film',
      ['Alt Movie'],
      '2024',
      [2000],
      undefined,
      'tt1'
    )
    expect(mockRankTorrents).toHaveBeenCalledWith([raw[0]], 'movie', 'Movie', '2024', {}, [
      'Movie',
      'Film',
      'Alt Movie'
    ])
    expect(mockRankTorrents).toHaveBeenCalledWith([raw[1]], 'movie', 'Movie', '2024', {}, [
      'Movie',
      'Film',
      'Alt Movie'
    ])
    if (outcome.kind === 'ok') {
      expect(outcome.found).toBe(2)
      expect(outcome.payload.torrents).toHaveLength(1)
      expect(outcome.payload.otherTorrents).toHaveLength(1)
      expect(outcome.payload.otherTorrents[0]?.recommended).toBe(false)
    }
  })

  it('keeps the real movie in the main list and same-word films in otherTorrents', async () => {
    mockGetMovieDetails.mockResolvedValue({
      id: 1,
      title: 'The Doll',
      original_title: 'Lalka',
      imdb_id: 'tt37082105',
      release_date: '2026-01-01',
      alternative_titles: []
    })
    const raw = [
      rawRelease({ title: 'Lalka.2026.1080p.WEB-DL' }),
      rawRelease({ title: 'Clint.Eastwood.The.Dollars.Trilogy.1080p', size: 200 }),
      rawRelease({ title: 'Gabbys.Dollhouse.The.Movie.2025.1080p', size: 300 }),
      rawRelease({ title: 'Beyond.the.Valley.of.the.Dolls.1970.1080p', size: 400 })
    ]
    mockUseProwlarr.mockReturnValue({ searchMovie: vi.fn().mockResolvedValue(raw) })
    mockRankTorrents.mockImplementation((torrents: unknown[]) =>
      (torrents as Array<ReturnType<typeof rawRelease>>).map((t) => rankedRelease(t))
    )

    const outcome = await searchMovieTorrents(1, 'en')

    if (outcome.kind === 'ok') {
      expect(outcome.payload.torrents.map((t) => t.title)).toEqual(['Lalka.2026.1080p.WEB-DL'])
      expect(outcome.payload.otherTorrents).toHaveLength(3)
      expect(outcome.payload.otherTorrents.every((t) => t.recommended === false)).toBe(true)
      expect(outcome.found).toBe(4)
    } else {
      throw new Error('expected a successful search')
    }
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
      expect(outcome.payload.otherTorrents).toEqual([])
    }
  })

  it('keeps unmapped releases from this season but excludes other seasons', async () => {
    const mockClient = {
      searchTv: vi
        .fn()
        .mockResolvedValue([
          rawRelease({ title: 'Show.S01E01.1080p' }),
          rawRelease({ title: 'Show.Sezon.1.Odcinek.99.1080p', size: 200 }),
          rawRelease({ title: 'Show.S02E01.1080p', size: 300 }),
          rawRelease({ title: 'Show.Sezon.2.Odcinek.5.1080p', size: 400 }),
          rawRelease({ title: 'Show.Sezon.2.1080p', size: 500 })
        ])
    }
    mockUseProwlarr.mockReturnValue(mockClient)
    mockRankTorrents.mockImplementation((torrents: unknown[]) =>
      (torrents as Array<ReturnType<typeof rawRelease>>).map((t) => rankedRelease(t))
    )

    const outcome = await searchSeasonTorrents(2, 1, 'en')

    expect(outcome.kind).toBe('ok')
    if (outcome.kind === 'ok') {
      // E99 is not in this season's TMDB episode list, so it cannot be filed
      // under an episode - but it must still be visible to the user. Releases
      // explicitly named S02 belong to the other season's page, not here.
      expect(outcome.payload.episodes[0]?.torrents).toHaveLength(1)
      expect(outcome.payload.otherTorrents).toHaveLength(1)
      expect(outcome.payload.otherTorrents[0]?.title).toContain('Odcinek.99')
      expect(outcome.payload.otherTorrents.some((t) => t.title.includes('S02') || t.title.includes('Sezon.2'))).toBe(
        false
      )
      expect(outcome.found).toBe(5)
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
    expect(toStreamEvent({ kind: 'query', state: 'failed', index: 1, total: 3, text: 'Q', reason: 'timeout' })).toEqual(
      {
        type: 'query',
        state: 'failed',
        index: 1,
        total: 3,
        text: 'Q',
        reason: 'timeout'
      }
    )
    expect(toStreamEvent({ kind: 'imdb', results: 4 })).toEqual({ type: 'imdb', results: 4 })
  })
})
