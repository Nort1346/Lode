import { describe, it, expect } from 'vitest'
import {
  buildEpisodeRelativePath,
  buildExtraFileRelativePath,
  buildMovieFileName,
  buildMovieRelativePath,
  getExtensionLower,
  sanitizeFileSegment,
  selectExtraFiles,
  selectMainVideoFile,
  selectVideoFiles
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

describe('selectVideoFiles', () => {
  it('returns every non-sample video, largest first', () => {
    const files = [
      makeFile('Show.S01E02.mkv', 200, 0),
      makeFile('Show.S01E01.mkv', 300, 1),
      makeFile('Show.S01E01.sample.mkv', 900, 2),
      makeFile('Show.S01E01.srt', 4, 3),
      makeFile('empty.mkv', 0, 4)
    ]
    expect(selectVideoFiles(files).map((pick) => pick.name)).toEqual(['Show.S01E01.mkv', 'Show.S01E02.mkv'])
  })

  it('returns an empty list without videos', () => {
    expect(selectVideoFiles([makeFile('notes.txt', 10)])).toEqual([])
  })
})

describe('selectExtraFiles', () => {
  const extensions = ['srt', 'sub', 'nfo']

  it('picks sidecars of the same video in the same folder', () => {
    const files = [
      makeFile('Movie.2021.mkv', 100, 0),
      makeFile('Movie.2021.en.srt', 4, 1),
      makeFile('Movie.2021.nfo', 2, 2),
      makeFile('poster.jpg', 8, 3),
      makeFile('Other.mkv', 10, 4)
    ]
    expect(selectExtraFiles(files, 'Movie.2021.mkv', extensions).map((pick) => pick.name)).toEqual([
      'Movie.2021.en.srt',
      'Movie.2021.nfo'
    ])
  })

  it('ignores files from other folders', () => {
    const files = [makeFile('Movie/Movie.srt', 4, 0), makeFile('Extras/Movie.srt', 4, 1)]
    expect(selectExtraFiles(files, 'Movie.mkv', extensions)).toEqual([])
  })

  it('ignores extensions that are not allowed', () => {
    const files = [makeFile('Movie.2021.exe', 4, 0)]
    expect(selectExtraFiles(files, 'Movie.2021.mkv', extensions)).toEqual([])
  })

  it('requires a separator after the video stem', () => {
    const files = [makeFile('Movie2.srt', 4, 0), makeFile('MovieExtras.nfo', 4, 1)]
    expect(selectExtraFiles(files, 'Movie.mkv', extensions)).toEqual([])
  })
})

describe('buildExtraFileRelativePath', () => {
  it('renames the sidecar after the organized video and keeps the suffix', () => {
    expect(
      buildExtraFileRelativePath({
        videoSourceName: 'Dune.2021.1080p.WEB-DL.mkv',
        videoTargetRelativePath: 'Dune (2021)/Dune (2021) 1080p WEB-DL.mkv',
        extraName: 'Dune.2021.1080p.WEB-DL.en.srt'
      })
    ).toBe('Dune (2021)/Dune (2021) 1080p WEB-DL.en.srt')
  })

  it('drops unrelated stems', () => {
    expect(
      buildExtraFileRelativePath({
        videoSourceName: 'Dune.2021.mkv',
        videoTargetRelativePath: 'Dune (2021)/Dune (2021).mkv',
        extraName: 'notes.nfo'
      })
    ).toBe('Dune (2021)/Dune (2021).nfo')
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
        airDate: null,
        resolution: '1080p',
        source: 'WEB-DL',
        extension: 'mkv'
      })
    ).toBe('Severance/Season 02/Severance - S02E05 1080p WEB-DL.mkv')
  })

  it('keeps the range for a multi-episode file', () => {
    expect(
      buildEpisodeRelativePath({
        seriesTitle: 'Severance',
        season: 2,
        episode: 5,
        episodeEnd: 7,
        airDate: null,
        resolution: null,
        source: null,
        extension: 'mkv'
      })
    ).toBe('Severance/Season 02/Severance - S02E05-E07.mkv')
  })

  it('ignores an end equal to the first episode', () => {
    expect(
      buildEpisodeRelativePath({
        seriesTitle: 'Severance',
        season: 2,
        episode: 5,
        episodeEnd: 5,
        airDate: null,
        resolution: null,
        source: null,
        extension: 'mkv'
      })
    ).toBe('Severance/Season 02/Severance - S02E05.mkv')
  })

  it('appends air date for daily releases', () => {
    const result = buildEpisodeRelativePath({
      seriesTitle: 'News',
      season: 2026,
      episode: 1,
      airDate: '2026-02-09',
      resolution: null,
      source: null,
      extension: 'mkv'
    })
    expect(result).toBe('News/Season 2026/News - S2026E01 - 2026-02-09.mkv')
  })
})
