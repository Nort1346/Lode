import { describe, it, expect } from 'vitest'
import {
  buildEpisodeRelativePath,
  buildMovieFileName,
  buildMovieRelativePath,
  getExtensionLower,
  sanitizeFileSegment,
  selectMainVideoFile
} from '#server/utils/library/organize'
import type { TorrentFile } from '#server/types/torrent'

function makeFile(name: string, size: number, index = 0): TorrentFile {
  return { index, name, size, progress: 1, priority: 1 }
}

describe('sanitizeFileSegment', () => {
  it('removes forbidden characters', () => {
    expect(sanitizeFileSegment('Movie: Part 1/2?')).toBe('Movie Part 1 2')
  })

  it('falls back for empty or dot-only names', () => {
    expect(sanitizeFileSegment('   ')).toBe('untitled')
    expect(sanitizeFileSegment('..')).toBe('untitled')
  })

  it('truncates long segments', () => {
    expect(sanitizeFileSegment('a'.repeat(200)).length).toBeLessThanOrEqual(120)
  })
})

describe('getExtensionLower', () => {
  it('returns lowercase extension of basename', () => {
    expect(getExtensionLower('Season 1/Episode.MKV')).toBe('mkv')
  })

  it('returns empty string without extension', () => {
    expect(getExtensionLower('README')).toBe('')
  })
})

describe('selectMainVideoFile', () => {
  it('picks the largest video file', () => {
    const files = [makeFile('a.mkv', 100, 0), makeFile('b.mkv', 900, 1), makeFile('poster.jpg', 5000, 2)]
    expect(selectMainVideoFile(files)?.name).toBe('b.mkv')
  })

  it('skips samples', () => {
    const files = [makeFile('movie-sample.mkv', 9000, 0), makeFile('movie.mkv', 100, 1)]
    expect(selectMainVideoFile(files)?.name).toBe('movie.mkv')
  })

  it('returns null when no video file exists', () => {
    expect(selectMainVideoFile([makeFile('poster.jpg', 10)])).toBeNull()
    expect(selectMainVideoFile([])).toBeNull()
  })
})

describe('buildMovieFileName', () => {
  it('builds title with year and quality', () => {
    expect(
      buildMovieFileName({ title: 'Dune', year: 2021, resolution: '1080p', source: 'WEB-DL', extension: 'mkv' })
    ).toBe('Dune (2021) 1080p WEB-DL.mkv')
  })

  it('omits missing parts without double spaces', () => {
    expect(buildMovieFileName({ title: 'Dune', year: null, resolution: null, source: null, extension: 'mp4' })).toBe(
      'Dune.mp4'
    )
  })
})

describe('buildMovieRelativePath', () => {
  it('nests file inside title folder', () => {
    expect(
      buildMovieRelativePath({ title: 'Dune', year: 2021, resolution: '2160p', source: 'BluRay', extension: 'mkv' })
    ).toBe('Dune (2021)/Dune (2021) 2160p BluRay.mkv')
  })
})

describe('buildEpisodeRelativePath', () => {
  it('builds season folder and episode code', () => {
    expect(
      buildEpisodeRelativePath({
        seriesTitle: 'Severance',
        season: 2,
        episode: 5,
        episodeTitle: null,
        airDate: null,
        resolution: '1080p',
        source: 'WEB-DL',
        extension: 'mkv'
      })
    ).toBe('Severance/Season 02/Severance - S02E05 1080p WEB-DL.mkv')
  })

  it('appends episode title when known', () => {
    const result = buildEpisodeRelativePath({
      seriesTitle: 'Severance',
      season: 1,
      episode: 1,
      episodeTitle: 'Good News About Hell',
      airDate: null,
      resolution: null,
      source: null,
      extension: 'mkv'
    })
    expect(result).toBe('Severance/Season 01/Severance - S01E01 - Good News About Hell.mkv')
  })

  it('falls back to air date for daily releases', () => {
    const result = buildEpisodeRelativePath({
      seriesTitle: 'News',
      season: 2026,
      episode: 1,
      episodeTitle: null,
      airDate: '2026-02-09',
      resolution: null,
      source: null,
      extension: 'mkv'
    })
    expect(result).toContain('2026-02-09')
  })
})
