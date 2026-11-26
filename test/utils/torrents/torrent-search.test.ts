import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  getTvShowDetails: mockGetTvShowDetails,
  getSeasonDetails: mockGetSeasonDetails,
  getImageUrl: mockGetImageUrl
}))

vi.mock('#server/utils/prowlarr', () => ({
  useProwlarr: mockUseProwlarr,
  PROWLARR_CATEGORIES: { MOVIES: 2000, TV: 5000 }
}))

vi.mock('#server/utils/torrents/torrent-ranker', () => ({ rankTorrents: mockRankTorrents }))

vi.mock('#server/utils/torrents/ranking-config', () => ({ getRankingConfig: mockGetRankingConfig }))

vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}))

import { searchSeasonTorrents } from '#server/utils/torrents/torrent-search'
import { titleMatchStrength } from '#server/utils/torrents/release-match'

function rawRelease(title: string, size = 100) {
  return {
    title,
    size,
    seeders: 10,
    leechers: 0,
    indexer: 'Test',
    magnetLink: 'magnet:x',
    downloadUrl: null,
    guid: null,
    publishDate: '2024-01-01',
    categories: [],
    infoUrl: '',
    imdbId: null,
    isPrivate: false
  }
}

function rankedRelease(result: ReturnType<typeof rawRelease>) {
  return {
    ...result,
    score: 90,
    percentage: 90,
    recommended: true,
    parsed: { resolution: '1080p', source: 'WEB', language: null, group: null, tags: [] },
    isSeasonPack: false
  }
}

describe('torrent-search/loose matches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTvShowDetails.mockResolvedValue({
      id: 2,
      name: 'Show',
      original_name: 'Show',
      first_air_date: '2024-01-01',
      seasons: Array.from({ length: 3 }, (_, i) => ({ season_number: i + 1, episode_count: 10 })),
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
    mockRankTorrents.mockImplementation((torrents: unknown[]) =>
      (torrents as Array<ReturnType<typeof rawRelease>>).map(rankedRelease)
    )
  })

  it('never recommends strength-0 releases in any TV bucket', async () => {
    const titles = [
      'Other.Show.S01.Complete.1080p',
      'Other.Show.S01-S03.E01-E10.1080p',
      'Other.Show.S01E01.1080p',
      'Other.Show.S01E99.1080p'
    ]
    mockUseProwlarr.mockReturnValue({ searchTv: vi.fn().mockResolvedValue(titles.map((title) => rawRelease(title))) })

    const outcome = await searchSeasonTorrents(2, 1, 'en')
    if (outcome.kind !== 'ok') throw new Error('expected a successful search')

    expect(outcome.payload.seasonPacks).toHaveLength(1)
    expect(outcome.payload.episodePacks).toHaveLength(1)
    expect(outcome.payload.episodes[0]?.torrents).toHaveLength(1)
    expect(outcome.payload.otherTorrents).toHaveLength(1)

    for (const torrent of [
      ...outcome.payload.seasonPacks,
      ...outcome.payload.episodePacks,
      ...(outcome.payload.episodes[0]?.torrents ?? []),
      ...outcome.payload.otherTorrents
    ]) {
      expect(torrent.recommended).toBe(false)
    }
  })

  it('splits an absolute range even when one covered season is unusually long', async () => {
    mockGetTvShowDetails.mockResolvedValue({
      id: 2,
      name: 'Show',
      original_name: 'Show',
      first_air_date: '2020-01-01',
      seasons: [
        { season_number: 1, episode_count: 10 },
        { season_number: 2, episode_count: 96 },
        { season_number: 3, episode_count: 10 }
      ],
      external_ids: { imdb_id: null }
    })
    const title = 'Show.S01-S03.E01-E96.1080p'
    mockUseProwlarr.mockReturnValue({ searchTv: vi.fn().mockResolvedValue([rawRelease(title)]) })

    const outcome = await searchSeasonTorrents(2, 1, 'en')
    if (outcome.kind !== 'ok') throw new Error('expected a successful search')

    expect(outcome.payload.episodePacks).toHaveLength(1)
    expect(outcome.payload.episodePacks[0]?.seasonEpisodes).toEqual(Array.from({ length: 10 }, (_, i) => i + 1))
  })

  it('files a multi-episode range as an episode pack, not a season pack', async () => {
    const title = 'Show.S02E01-02.720p.WEB-DL.DDP5.1.Atmos-GROUP'
    mockUseProwlarr.mockReturnValue({ searchTv: vi.fn().mockResolvedValue([rawRelease(title)]) })

    const outcome = await searchSeasonTorrents(2, 2, 'en')
    if (outcome.kind !== 'ok') throw new Error('expected a successful search')

    expect(outcome.payload.seasonPacks).toEqual([])
    expect(outcome.payload.episodePacks).toHaveLength(1)
    expect(outcome.payload.episodePacks[0]?.seasons).toEqual([2])
    expect(outcome.payload.episodePacks[0]?.episodes).toEqual([1, 2])
    expect(outcome.payload.episodePacks[0]?.seasonEpisodes).toEqual([1, 2])
    expect(outcome.payload.episodes.every((ep) => ep.torrents.length === 0)).toBe(true)
  })
})

describe('torrent-search/scene group prefixes', () => {
  it('matches the show despite an uploader group before or after the title', () => {
    expect(titleMatchStrength('RARBG.Show.Name.S01E01.1080p', ['Show Name'], '2020', 'tv')).toBe(2)
    expect(titleMatchStrength('Show.Name.S01E01.1080p-RARBG', ['Show Name'], '2020', 'tv')).toBe(2)
    // Whole-token matching is otherwise unchanged.
    expect(titleMatchStrength('Other.Show.Name.S01E01.1080p', ['Show Name'], '2020', 'tv')).toBe(0)
  })
})
