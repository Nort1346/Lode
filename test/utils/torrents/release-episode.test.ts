import { describe, it, expect } from 'vitest'
import {
  parseEpisodeInfo,
  titleIsSeasonPack,
  titleMatchesEpisode
} from '#server/utils/torrents/release-episode'

describe('release-episode/parseEpisodeInfo', () => {
  const cases: Array<{ name: string; kind: string; seasons: number[]; episodes: number[]; airDate: string | null }> = [
    // Single episodes
    { name: 'Breaking.Bad.S01E02.1080p.WEB-DL-GROUP', kind: 'episode', seasons: [1], episodes: [2], airDate: null },
    { name: 'show.s02e05.720p.hdtv', kind: 'episode', seasons: [2], episodes: [5], airDate: null },
    { name: 'Show.S1E2.HDTV', kind: 'episode', seasons: [1], episodes: [2], airDate: null },
    { name: 'Show.4x01.HDTV', kind: 'episode', seasons: [4], episodes: [1], airDate: null },
    { name: 'Show.S00E01.Special.1080p', kind: 'episode', seasons: [0], episodes: [1], airDate: null },
    { name: 'Show.S01.E02.1080p', kind: 'episode', seasons: [1], episodes: [2], airDate: null },
    { name: '24.S01E01.1080p.WEB-DL', kind: 'episode', seasons: [1], episodes: [1], airDate: null },
    // Multi-episode
    { name: 'Show.S01E01-E03.1080p.WEB-DL', kind: 'multi-episode', seasons: [1], episodes: [1, 2, 3], airDate: null },
    { name: 'Show.S01E01E02.1080p', kind: 'multi-episode', seasons: [1], episodes: [1, 2], airDate: null },
    { name: 'Show.S02E10-E12.Bluray', kind: 'multi-episode', seasons: [2], episodes: [10, 11, 12], airDate: null },
    // Season packs
    { name: 'Show.S01.1080p.WEB-DL-GROUP', kind: 'season-pack', seasons: [1], episodes: [], airDate: null },
    { name: 'Show.Season.2.COMPLETE.1080p', kind: 'season-pack', seasons: [2], episodes: [], airDate: null },
    { name: 'Show.Sezon.1.1080p.PL', kind: 'season-pack', seasons: [1], episodes: [], airDate: null },
    { name: 'Show.Complete.Season.2.1080p', kind: 'season-pack', seasons: [2], episodes: [], airDate: null },
    // Multi-season packs
    { name: 'Show.S01-S03.1080p.WEB-DL', kind: 'multiseason-pack', seasons: [1, 2, 3], episodes: [], airDate: null },
    { name: 'Show.Season.1-2.1080p', kind: 'multiseason-pack', seasons: [1, 2], episodes: [], airDate: null },
    // Complete series
    { name: 'Show.Complete.Series.720p.HDTV', kind: 'complete-series', seasons: [], episodes: [], airDate: null },
    // Daily / date-based
    { name: 'Show.2024.05.12.1080p.WEB-DL', kind: 'daily', seasons: [], episodes: [], airDate: '2024-05-12' },
    { name: 'Show.2024-05-12.1080p', kind: 'daily', seasons: [], episodes: [], airDate: '2024-05-12' },
    // Anime absolute numbering
    { name: 'Show.EP.1090.1080p', kind: 'absolute', seasons: [], episodes: [1090], airDate: null },
    { name: '[SubsPlease] One Piece - 1090 (1080p)', kind: 'absolute', seasons: [], episodes: [1090], airDate: null },
    { name: 'Show.Odc.12.1080p', kind: 'absolute', seasons: [], episodes: [12], airDate: null },
    // Unknown / no info
    { name: 'Dune.Part.Two.2024.1080p.WEB-DL.x264-GROUP', kind: 'unknown', seasons: [], episodes: [], airDate: null },
    { name: 'The.100.2014.1080p.WEB-DL', kind: 'unknown', seasons: [], episodes: [], airDate: null },
    { name: '2001.A.Space.Odyssey.1968.1080p.BluRay', kind: 'unknown', seasons: [], episodes: [], airDate: null },
    { name: 'Show.1920x1080.WEB-DL', kind: 'unknown', seasons: [], episodes: [], airDate: null },
    { name: 'Station.19.2018.720p.HDTV', kind: 'unknown', seasons: [], episodes: [], airDate: null }
  ]

  for (const c of cases) {
    it(`parses "${c.name}" as ${c.kind}`, () => {
      expect(parseEpisodeInfo(c.name)).toEqual({
        kind: c.kind,
        seasons: c.seasons,
        episodes: c.episodes,
        airDate: c.airDate
      })
    })
  }

  it('is case insensitive', () => {
    expect(parseEpisodeInfo('show.s01e02.1080p').kind).toBe('episode')
    expect(parseEpisodeInfo('SHOW.SEASON.1.1080p').kind).toBe('season-pack')
  })

  it('never mistakes years, resolutions or codecs for episodes', () => {
    for (const name of [
      'Show.2024.1080p.WEB-DL',
      'Show.2160p.BluRay.x264',
      'Show.2019.720p.HDTV.x265',
      'Show.9-1-1.S01.1080p'
    ]) {
      const info = parseEpisodeInfo(name)
      expect(info.kind === 'episode' || info.kind === 'multi-episode' || info.kind === 'absolute').toBe(false)
    }
  })
})

describe('release-episode/titleMatchesEpisode', () => {
  const cases: Array<{ title: string; season: number; episode: number; expected: boolean }> = [
    { title: 'Show.S01E02.1080p', season: 1, episode: 2, expected: true },
    { title: 'Show.S01E02.1080p', season: 1, episode: 3, expected: false },
    { title: 'Show.S01E02.1080p', season: 2, episode: 2, expected: false },
    { title: 'Show.S04E01-E03.1080p', season: 4, episode: 2, expected: true },
    { title: 'Show.S04E01-E03.1080p', season: 4, episode: 4, expected: false },
    { title: 'Show.S01E01E02.1080p', season: 1, episode: 2, expected: true },
    { title: 'Show.4x01.HDTV', season: 4, episode: 1, expected: true },
    { title: 'Show.Odc.12.1080p', season: 3, episode: 12, expected: true },
    { title: 'Show.Episode.5.720p', season: 1, episode: 5, expected: true },
    { title: 'Show.S01.1080p.WEB-DL', season: 1, episode: 5, expected: false },
    { title: 'Show.2024.05.12.1080p', season: 1, episode: 12, expected: false },
    { title: 'Show.2160p.BluRay.x264', season: 1, episode: 1, expected: false }
  ]

  for (const c of cases) {
    it(`"${c.title}" s=${c.season} e=${c.episode} -> ${c.expected}`, () => {
      expect(titleMatchesEpisode(c.title, c.season, c.episode)).toBe(c.expected)
    })
  }
})

describe('release-episode/titleIsSeasonPack', () => {
  const cases: Array<{ title: string; season: number; expected: boolean }> = [
    { title: 'Show.S01.1080p.WEB-DL', season: 1, expected: true },
    { title: 'Show.S01.1080p.WEB-DL', season: 2, expected: false },
    { title: 'Show.S01-S03.1080p', season: 2, expected: true },
    { title: 'Show.Season.2.COMPLETE.1080p', season: 2, expected: true },
    { title: 'Show.Complete.Series.720p', season: 5, expected: true },
    { title: 'Show.Complete.Season.1080p', season: 1, expected: true },
    { title: 'Show.S01E02.1080p', season: 1, expected: false },
    { title: 'Show.S01E01-E03.1080p', season: 1, expected: false },
    { title: 'Dune.Part.Two.2024.1080p', season: 1, expected: false }
  ]

  for (const c of cases) {
    it(`"${c.title}" season ${c.season} -> ${c.expected}`, () => {
      expect(titleIsSeasonPack(c.title, c.season)).toBe(c.expected)
    })
  }
})
