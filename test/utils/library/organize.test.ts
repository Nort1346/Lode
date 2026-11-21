import { describe, it, expect } from 'vitest'
import {
  buildEpisodeRelativePath,
  buildExtraFileRelativePath,
  buildMovieFileName,
  buildMovieRelativePath,
  getExtensionLower,
  planExtraFileImports,
  sanitizeFileSegment,
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

  it('skips video files inside extras and featurette folders', () => {
    const files = [
      makeFile('Show.S01E01.mkv', 300, 0),
      makeFile('Featurettes/Behind.the.Scenes.mkv', 900, 1),
      makeFile('Extras/Trailer.mkv', 500, 2),
      makeFile('Bonus Features/Interview.mkv', 400, 3)
    ]
    expect(selectVideoFiles(files).map((pick) => pick.name)).toEqual(['Show.S01E01.mkv'])
  })

  it('returns an empty list without videos', () => {
    expect(selectVideoFiles([makeFile('notes.txt', 10)])).toEqual([])
  })
})

describe('planExtraFileImports', () => {
  const extensions = ['srt', 'sub', 'nfo']

  it('attaches same-folder sidecars to their video', () => {
    const files = [
      makeFile('Movie.2021.mkv', 100, 0),
      makeFile('Movie.2021.en.srt', 4, 1),
      makeFile('Movie.2021.nfo', 2, 2),
      makeFile('poster.jpg', 8, 3),
      makeFile('Other.mkv', 10, 4)
    ]
    const plan = planExtraFileImports(files, ['Movie.2021.mkv'], extensions)
    expect(plan.byVideo.get('Movie.2021.mkv')?.map((pick) => pick.name)).toEqual([
      'Movie.2021.en.srt',
      'Movie.2021.nfo'
    ])
    expect(plan.releaseLevel).toEqual([])
  })

  it('attaches a full-stem sidecar from another folder to its video', () => {
    const files = [makeFile('Movie.2021.mkv', 100, 0), makeFile('subs/Movie.2021.en.srt', 4, 1)]
    const plan = planExtraFileImports(files, ['Movie.2021.mkv'], extensions)
    expect(plan.byVideo.get('Movie.2021.mkv')?.map((pick) => pick.name)).toEqual(['subs/Movie.2021.en.srt'])
    expect(plan.releaseLevel).toEqual([])
  })

  it('files root and subfolder extras without a stem match at release level', () => {
    const files = [
      makeFile('Movie.2021.mkv', 100, 0),
      makeFile('ang.srt', 4, 1),
      makeFile('subs/pol.srt', 4, 2),
      makeFile('Movie2.srt', 4, 3),
      makeFile('poster.jpg', 8, 4)
    ]
    const plan = planExtraFileImports(files, ['Movie.2021.mkv'], extensions)
    expect(plan.byVideo.size).toBe(0)
    expect(plan.releaseLevel.map((pick) => pick.name)).toEqual(['ang.srt', 'subs/pol.srt', 'Movie2.srt'])
  })

  it('attributes sidecars per episode in a multi-video release', () => {
    const files = [
      makeFile('Show.S01E01.mkv', 100, 0),
      makeFile('Show.S01E02.mkv', 100, 1),
      makeFile('Show.S01E01.en.srt', 4, 2),
      makeFile('subs/Show.S01E02.pl.srt', 4, 3),
      makeFile('subs/ang.srt', 4, 4)
    ]
    const plan = planExtraFileImports(files, ['Show.S01E01.mkv', 'Show.S01E02.mkv'], extensions)
    expect(plan.byVideo.get('Show.S01E01.mkv')?.map((pick) => pick.name)).toEqual(['Show.S01E01.en.srt'])
    expect(plan.byVideo.get('Show.S01E02.mkv')?.map((pick) => pick.name)).toEqual(['subs/Show.S01E02.pl.srt'])
    expect(plan.releaseLevel.map((pick) => pick.name)).toEqual(['subs/ang.srt'])
  })

  it('ignores extensions that are not allowed', () => {
    const plan = planExtraFileImports([makeFile('Movie.2021.exe', 4, 0)], ['Movie.2021.mkv'], extensions)
    expect(plan.byVideo.size).toBe(0)
    expect(plan.releaseLevel).toEqual([])
  })

  it('returns an empty plan without allowed extensions', () => {
    const plan = planExtraFileImports([makeFile('ang.srt', 4, 0)], ['Movie.mkv'], [])
    expect(plan.byVideo.size).toBe(0)
    expect(plan.releaseLevel).toEqual([])
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

  it('keeps an unrelated stem as a language-like suffix so extras never collide', () => {
    expect(
      buildExtraFileRelativePath({
        videoSourceName: 'Dune.2021.mkv',
        videoTargetRelativePath: 'Dune (2021)/Dune (2021).mkv',
        extraName: 'subs/ang.srt'
      })
    ).toBe('Dune (2021)/Dune (2021).ang.srt')
  })

  it('keeps an exact-stem sidecar without a suffix', () => {
    expect(
      buildExtraFileRelativePath({
        videoSourceName: 'Dune.2021.mkv',
        videoTargetRelativePath: 'Dune (2021)/Dune (2021).mkv',
        extraName: 'Dune.2021.nfo'
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
