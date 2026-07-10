import { describe, it, expect } from 'vitest'
import { rankTorrents, parseTorrentTitle, formatScore } from '#server/utils/torrent-ranker'
import { DEFAULT_RANKING_CONFIG } from '#server/types/ranking'
import type { ProwlarrResult } from '#server/types/prowlarr'

const mockResults: ProwlarrResult[] = [
  {
    title: 'Movie.2024.1080p.BluRay.x264-GROUP',
    size: 10737418240, // 10 GB
    seeders: 100,
    leechers: 10,
    indexer: 'TestIndexer',
    downloadUrl: 'magnet:?xt=urn:btih:test1',
    infoUrl: 'https://example.com/test1',
    protocol: 'torrent',
    publishDate: '2024-01-01T00:00:00Z',
    age: 10,
    infoHash: 'hash1'
  },
  {
    title: 'Movie.2024.2160p.Remux-GROUP',
    size: 53687091200, // 50 GB
    seeders: 50,
    leechers: 5,
    indexer: 'TestIndexer',
    downloadUrl: 'magnet:?xt=urn:btih:test2',
    infoUrl: 'https://example.com/test2',
    protocol: 'torrent',
    publishDate: '2024-01-01T00:00:00Z',
    age: 5,
    infoHash: 'hash2'
  },
  {
    title: 'Movie.2024.720p.WEB-DL.x264-GROUP',
    size: 5368709120, // 5 GB
    seeders: 200,
    leechers: 20,
    indexer: 'TestIndexer',
    downloadUrl: 'magnet:?xt=urn:btih:test3',
    infoUrl: 'https://example.com/test3',
    protocol: 'torrent',
    publishDate: '2024-01-01T00:00:00Z',
    age: 20,
    infoHash: 'hash3'
  }
]

describe('parseTorrentTitle', () => {
  it('parses resolution', () => {
    const parsed = parseTorrentTitle('Movie.2024.1080p.BluRay.x264-GROUP')
    expect(parsed.resolution).toBe('1080p')
  })

  it('parses source', () => {
    const parsed = parseTorrentTitle('Movie.2024.1080p.BluRay.x264-GROUP')
    expect(parsed.source).toBe('bluray')
  })

  it('parses language patterns', () => {
    const parsed = parseTorrentTitle('Movie.2024.1080p.PL.Dubbing.GROUP')
    expect(parsed.language).toBe('pl-dub')
  })

  it('parses group', () => {
    const parsed = parseTorrentTitle('Movie.2024.1080p.BluRay.x264-YTS')
    expect(parsed.group).toBe('yts')
  })

  it('returns null for missing fields', () => {
    const parsed = parseTorrentTitle('RandomTitle')
    expect(parsed.resolution).toBeNull()
    expect(parsed.source).toBeNull()
    expect(parsed.language).toBeNull()
    expect(parsed.group).toBeNull()
  })
})

describe('rankTorrents', () => {
  it('returns ranked torrents with scores', () => {
    const ranked = rankTorrents(mockResults, 'movie', 'Movie', '2024')

    expect(ranked).toHaveLength(3)
    ranked.forEach((r) => {
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.percentage).toBeGreaterThanOrEqual(0)
      expect(r.percentage).toBeLessThanOrEqual(100)
      expect(r.recommended).toBeDefined()
    })
  })

  it('sorts by score descending', () => {
    const ranked = rankTorrents(mockResults, 'movie', 'Movie', '2024')
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score)
    }
  })

  it('marks top N as recommended', () => {
    const ranked = rankTorrents(mockResults, 'movie', 'Movie', '2024')
    const recommendedCount = ranked.filter((r) => r.recommended).length
    expect(recommendedCount).toBeLessThanOrEqual(DEFAULT_RANKING_CONFIG.recommendedCount)
    expect(recommendedCount).toBeLessThanOrEqual(mockResults.length)
  })

  it('includes parsed title info', () => {
    const ranked = rankTorrents(mockResults, 'movie', 'Movie', '2024')
    ranked.forEach((r) => {
      expect(r.parsed).toBeDefined()
      expect(r.parsed.resolution).toBeDefined()
      expect(r.parsed.source).toBeDefined()
    })
  })

  it('handles empty results', () => {
    const ranked = rankTorrents([], 'movie', 'Movie', '2024')
    expect(ranked).toEqual([])
  })

  it('uses custom config when provided', () => {
    const customConfig = {
      ...DEFAULT_RANKING_CONFIG,
      weights: {
        ...DEFAULT_RANKING_CONFIG.weights,
        resolution: 100
      }
    }
    const ranked = rankTorrents(mockResults, 'movie', 'Movie', '2024', customConfig)
    expect(ranked).toHaveLength(3)
  })
})

describe('formatScore', () => {
  it('formats score as percentage', () => {
    const score = 150
    const result = formatScore(score)
    expect(result).toContain('%')
  })

  it('handles zero score', () => {
    const result = formatScore(0)
    expect(result).toBe('0%')
  })
})

describe('DEFAULT_RANKING_CONFIG', () => {
  it('has all required weights', () => {
    const weights = DEFAULT_RANKING_CONFIG.weights
    expect(weights.resolution).toBeGreaterThan(0)
    expect(weights.language).toBeGreaterThan(0)
    expect(weights.seeders).toBeGreaterThan(0)
    expect(weights.size).toBeGreaterThan(0)
    expect(weights.source).toBeGreaterThan(0)
    expect(weights.group).toBeGreaterThan(0)
  })

  it('has resolution scores', () => {
    expect(DEFAULT_RANKING_CONFIG.resolutions['2160p']).toBeGreaterThan(0)
    expect(DEFAULT_RANKING_CONFIG.resolutions['1080p']).toBeGreaterThan(0)
    expect(DEFAULT_RANKING_CONFIG.resolutions['720p']).toBeGreaterThan(0)
  })

  it('has source scores', () => {
    expect(DEFAULT_RANKING_CONFIG.sources.remux).toBeGreaterThan(0)
    expect(DEFAULT_RANKING_CONFIG.sources.bluray).toBeGreaterThan(0)
    expect(DEFAULT_RANKING_CONFIG.sources.webdl).toBeGreaterThan(0)
  })

  it('has language configs', () => {
    expect(DEFAULT_RANKING_CONFIG.languages.length).toBeGreaterThan(0)
    const fallback = DEFAULT_RANKING_CONFIG.languages.find((l) => l.isFallback)
    expect(fallback).toBeDefined()
  })

  it('has known groups', () => {
    expect(DEFAULT_RANKING_CONFIG.knownGroups.length).toBeGreaterThan(0)
  })

  it('has size thresholds for all types', () => {
    expect(DEFAULT_RANKING_CONFIG.sizeThresholds.movie.length).toBeGreaterThan(0)
    expect(DEFAULT_RANKING_CONFIG.sizeThresholds.series.length).toBeGreaterThan(0)
    expect(DEFAULT_RANKING_CONFIG.sizeThresholds.seasonPack.length).toBeGreaterThan(0)
  })
})
