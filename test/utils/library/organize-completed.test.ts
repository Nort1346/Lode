import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

vi.mock('#server/utils/tmdb', () => ({
  getMovieDetails: vi.fn(),
  getTvShowDetails: vi.fn()
}))

const mockFailRenameFor = vi.hoisted(() => ({ value: '' }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rename: (from: Parameters<typeof actual.rename>[0], to: Parameters<typeof actual.rename>[1]) => {
      if (mockFailRenameFor.value !== '' && String(from).endsWith(mockFailRenameFor.value)) {
        return Promise.reject(Object.assign(new Error('simulated I/O error'), { code: 'EIO' }))
      }
      return actual.rename(from, to)
    },
    link: (from: Parameters<typeof actual.link>[0], to: Parameters<typeof actual.link>[1]) => {
      if (mockFailRenameFor.value !== '' && String(from).endsWith(mockFailRenameFor.value)) {
        return Promise.reject(Object.assign(new Error('simulated I/O error'), { code: 'EIO' }))
      }
      return actual.link(from, to)
    }
  }
})

import { organizeCompletedDownload, type OrganizeDeps } from '#server/utils/library/organize-completed'
import type { OrganizeJobInput } from '#server/types/media-organize'
import type { TorrentFile } from '#server/types/torrent'

let workdir = ''
let stagingDir = ''
let libraryDir = ''

beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), 'lode-organize-'))
  stagingDir = join(workdir, 'staging')
  libraryDir = join(workdir, 'library')
})

afterEach(async () => {
  mockFailRenameFor.value = ''
  await rm(workdir, { recursive: true, force: true })
})

function makeFile(name: string, size = 100): TorrentFile {
  return { index: 0, name, size, progress: 1, priority: 1 }
}

function makeJob(overrides: Partial<OrganizeJobInput> = {}): OrganizeJobInput {
  return {
    downloadId: 'dl-1',
    savePath: 'movies',
    torrentName: 'Dune.2021.1080p.WEB-DL.mkv',
    label: 'Dune',
    tmdbId: null,
    mediaType: 'movie',
    resolution: null,
    ...overrides
  }
}

function makeQbit(files: TorrentFile[], savePath: string) {
  return {
    findTorrentByHash: vi.fn(async () => ({
      hash: 'h',
      name: 't',
      progress: 1,
      eta: 0,
      dlspeed: 0,
      dlspeed_avg: 0,
      upspeed: 0,
      size: 100,
      amount_left: 0,
      downloaded: 100,
      num_seeds: 1,
      num_complete: 1,
      num_leechs: 0,
      state: 'uploading',
      save_path: savePath,
      category: 'movies',
      tags: '',
      added_on: 0,
      completion_on: 1
    })),
    getTorrentFiles: vi.fn(async () => files),
    deleteTorrent: vi.fn(async () => undefined)
  }
}

function makeDeps(qbit: ReturnType<typeof makeQbit>, overrides: Partial<OrganizeDeps> = {}): OrganizeDeps {
  return {
    qbit,
    libraryMovies: libraryDir,
    librarySeries: libraryDir,
    stagingMovies: stagingDir,
    stagingSeries: stagingDir,
    importMode: 'copy',
    importExtraFiles: false,
    extraFileExtensions: ['srt', 'sub', 'nfo'],
    cleanupStaging: false,
    ...overrides
  }
}

async function seedStaging(name: string, content = 'video-bytes'): Promise<void> {
  const full = join(stagingDir, name)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, content)
}

describe('organizeCompletedDownload', () => {
  it('skips non-movie/series libraries', async () => {
    const qbit = makeQbit([], stagingDir)
    const result = await organizeCompletedDownload('h', makeJob({ savePath: 'games' }), makeDeps(qbit))
    expect(result.status).toBe('skipped')
    expect(qbit.getTorrentFiles).not.toHaveBeenCalled()
  })

  it('fails without a staging dir instead of renaming inside the library', async () => {
    const qbit = makeQbit([makeFile('Dune.2021.1080p.WEB-DL.mkv', 11)], libraryDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob(),
      makeDeps(qbit, { stagingMovies: '', stagingSeries: '' })
    )
    expect(result.status).toBe('failed')
    expect(result.error).toContain('staging dir not configured')
    expect(result.error).toContain('NUXT_DOWNLOAD_PATH_MOVIES')
  })

  it('fails when no video file is present', async () => {
    const qbit = makeQbit([makeFile('poster.jpg')], stagingDir)
    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit))
    expect(result.status).toBe('failed')
    expect(result.error).toContain('no video file')
  })

  it('imports a movie across staging and library dirs', async () => {
    await seedStaging('Dune.2021.1080p.WEB-DL.mkv')
    const qbit = makeQbit([makeFile('Dune.2021.1080p.WEB-DL.mkv', 11)], stagingDir)
    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit))

    expect(result.status).toBe('done')
    expect(result.importedFiles).toBe(1)
    expect(result.targetRelativePath).toBe('Dune (2021)/Dune (2021) 1080p web-dl.mkv')
    expect(await readFile(join(libraryDir, result.targetRelativePath ?? ''), 'utf8')).toBe('video-bytes')
  })

  it('hardlinks in hardlink mode, leaving the torrent file in place', async () => {
    await seedStaging('Dune.2021.1080p.WEB-DL.mkv')
    const qbit = makeQbit([makeFile('Dune.2021.1080p.WEB-DL.mkv', 11)], stagingDir)
    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit, { importMode: 'hardlink' }))

    expect(result.status).toBe('done')
    const [source, target] = await Promise.all([
      stat(join(stagingDir, 'Dune.2021.1080p.WEB-DL.mkv')),
      stat(join(libraryDir, result.targetRelativePath ?? ''))
    ])
    expect(target.ino).toBe(source.ino)
  })

  it('falls back to the staging dir when qBittorrent reports another mount path', async () => {
    await seedStaging('Dune.2021.1080p.WEB-DL.mkv')
    const qbit = makeQbit([makeFile('Dune.2021.1080p.WEB-DL.mkv', 11)], '/downloads/movies')
    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit))

    expect(result.status).toBe('done')
    expect(result.targetRelativePath).toBe('Dune (2021)/Dune (2021) 1080p web-dl.mkv')
  })

  it('fails when the source file is missing in every known root', async () => {
    const qbit = makeQbit([makeFile('Dune.2021.1080p.WEB-DL.mkv', 11)], '/downloads/movies')
    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit))

    expect(result.status).toBe('failed')
    expect(result.error).toContain('source file not found')
  })

  it('refuses to duplicate a torrent whose save path is already inside the library', async () => {
    await mkdir(libraryDir, { recursive: true })
    await writeFile(join(libraryDir, 'Dune.2021.1080p.WEB-DL.mkv'), 'library-bytes')
    const qbit = makeQbit([makeFile('Dune.2021.1080p.WEB-DL.mkv', 11)], libraryDir)
    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit))

    expect(result.status).toBe('failed')
    expect(result.error).toContain('inside the library')
    await expect(stat(join(libraryDir, 'Dune (2021)'))).rejects.toThrow()
  })

  it('skips when the target file already exists', async () => {
    await seedStaging('Dune.2021.1080p.WEB-DL.mkv')
    await mkdir(join(libraryDir, 'Dune (2021)'), { recursive: true })
    await writeFile(join(libraryDir, 'Dune (2021)/Dune (2021) 1080p web-dl.mkv'), 'existing')
    const qbit = makeQbit([makeFile('Dune.2021.1080p.WEB-DL.mkv', 11)], stagingDir)
    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit))

    expect(result.status).toBe('skipped')
    expect(result.error).toBe('target already exists')
    expect(result.skippedFiles).toBe(1)
    expect(result.targetRelativePath).toBe('Dune (2021)/Dune (2021) 1080p web-dl.mkv')
  })

  it('imports a tv episode with season folder', async () => {
    await seedStaging('Show.S01E02.1080p.WEB-DL.mkv')
    const qbit = makeQbit([makeFile('Show.S01E02.1080p.WEB-DL.mkv', 11)], stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show.S01E02.1080p.WEB-DL.mkv', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit)
    )

    expect(result.status).toBe('done')
    expect(result.targetRelativePath).toBe('Show/Season 01/Show - S01E02 1080p web-dl.mkv')
  })

  it('imports every episode of a season pack', async () => {
    const names = ['Show.S01E01.1080p.WEB-DL.mkv', 'Show.S01E02.1080p.WEB-DL.mkv', 'Show.S01E03.1080p.WEB-DL.mkv']
    for (const name of names) await seedStaging(name)
    const qbit = makeQbit(
      names.map((name) => makeFile(name, 50)),
      stagingDir
    )
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show.S01.1080p.WEB-DL', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit)
    )

    expect(result.status).toBe('done')
    expect(result.importedFiles).toBe(3)
    for (const episode of ['01', '02', '03']) {
      const info = await stat(join(libraryDir, `Show/Season 01/Show - S01E${episode} 1080p web-dl.mkv`))
      expect(info.isFile()).toBe(true)
    }
  })

  it('imports a season pack that ships featurettes without failing', async () => {
    const names = ['Show.S01E01.1080p.WEB-DL.mkv', 'Show.S01E02.1080p.WEB-DL.mkv', 'Featurettes/Behind the Scenes.mkv']
    for (const name of names) await seedStaging(name)
    const qbit = makeQbit(
      names.map((name) => makeFile(name, 50)),
      stagingDir
    )
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show.S01', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit)
    )

    expect(result.status).toBe('done')
    expect(result.importedFiles).toBe(2)
    await expect(stat(join(libraryDir, 'Show/Featurettes'))).rejects.toThrow()
  })

  it('keeps the episode range for a multi-episode file', async () => {
    await seedStaging('Show.S01E01-E03.1080p.WEB-DL.mkv')
    const qbit = makeQbit([makeFile('Show.S01E01-E03.1080p.WEB-DL.mkv', 50)], stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show.S01E01-E03', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit)
    )

    expect(result.status).toBe('done')
    expect(result.targetRelativePath).toBe('Show/Season 01/Show - S01E01-E03 1080p web-dl.mkv')
  })

  it('imports subtitles next to the video when extra files are enabled', async () => {
    await seedStaging('Dune.2021.1080p.WEB-DL.mkv')
    await seedStaging('Dune.2021.1080p.WEB-DL.en.srt', 'subs')
    await seedStaging('poster.jpg', 'jpeg')
    const files = [
      makeFile('Dune.2021.1080p.WEB-DL.mkv', 11),
      makeFile('Dune.2021.1080p.WEB-DL.en.srt', 4),
      makeFile('poster.jpg', 8)
    ]
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit, { importExtraFiles: true }))

    expect(result.status).toBe('done')
    expect(result.extrasImported).toBe(1)
    expect(await readFile(join(libraryDir, 'Dune (2021)/Dune (2021) 1080p web-dl.en.srt'), 'utf8')).toBe('subs')
    await expect(stat(join(libraryDir, 'Dune (2021)/poster.jpg'))).rejects.toThrow()
  })

  it('imports release-level subtitles from the root and subfolders next to the movie', async () => {
    await seedStaging('Dune.2021.1080p.WEB-DL.mkv')
    await seedStaging('ang.srt', 'root-sub')
    await seedStaging('subs/pol.srt', 'folder-sub')
    const files = [makeFile('Dune.2021.1080p.WEB-DL.mkv', 11), makeFile('ang.srt', 4), makeFile('subs/pol.srt', 4)]
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit, { importExtraFiles: true }))

    expect(result.status).toBe('done')
    expect(result.extrasImported).toBe(2)
    // No stem match: each keeps its own stem as a language-like suffix.
    expect(await readFile(join(libraryDir, 'Dune (2021)/Dune (2021) 1080p web-dl.ang.srt'), 'utf8')).toBe('root-sub')
    expect(await readFile(join(libraryDir, 'Dune (2021)/Dune (2021) 1080p web-dl.pol.srt'), 'utf8')).toBe('folder-sub')
  })

  it('moves release-level subtitles out of staging in move mode', async () => {
    await seedStaging('Dune.2021.1080p.WEB-DL.mkv')
    await seedStaging('subs/ang.srt', 'folder-sub')
    const files = [makeFile('Dune.2021.1080p.WEB-DL.mkv', 11), makeFile('subs/ang.srt', 4)]
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob(),
      makeDeps(qbit, { importExtraFiles: true, importMode: 'move' })
    )

    expect(result.status).toBe('done')
    expect(result.extrasImported).toBe(1)
    expect(await readFile(join(libraryDir, 'Dune (2021)/Dune (2021) 1080p web-dl.ang.srt'), 'utf8')).toBe('folder-sub')
    await expect(stat(join(stagingDir, 'subs/ang.srt'))).rejects.toThrow()
  })

  it('imports a release-level subtitle only once for a season pack', async () => {
    const names = ['Show.S01E01.1080p.WEB-DL.mkv', 'Show.S01E02.1080p.WEB-DL.mkv']
    for (const name of names) await seedStaging(name)
    await seedStaging('subs/ang.srt', 'pack-sub')
    const files = [...names.map((name) => makeFile(name, 50)), makeFile('subs/ang.srt', 4)]
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show.S01', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit, { importExtraFiles: true })
    )

    expect(result.status).toBe('done')
    expect(result.importedFiles).toBe(2)
    expect(result.extrasImported).toBe(1)
    expect(await readFile(join(libraryDir, 'Show/Season 01/Show - S01E01 1080p web-dl.ang.srt'), 'utf8')).toBe(
      'pack-sub'
    )
    await expect(stat(join(libraryDir, 'Show/Season 01/Show - S01E02 1080p web-dl.ang.srt'))).rejects.toThrow()
  })

  it('attaches a cross-folder sidecar to its episode', async () => {
    await seedStaging('Show.S01E01.1080p.WEB-DL.mkv')
    await seedStaging('subs/Show.S01E01.1080p.WEB-DL.pl.srt', 'pl-sub')
    const files = [makeFile('Show.S01E01.1080p.WEB-DL.mkv', 11), makeFile('subs/Show.S01E01.1080p.WEB-DL.pl.srt', 4)]
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show.S01E01', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit, { importExtraFiles: true })
    )

    expect(result.status).toBe('done')
    expect(result.extrasImported).toBe(1)
    expect(await readFile(join(libraryDir, 'Show/Season 01/Show - S01E01 1080p web-dl.pl.srt'), 'utf8')).toBe('pl-sub')
  })

  it('ignores extra files when the setting is off', async () => {
    await seedStaging('Dune.2021.1080p.WEB-DL.mkv')
    await seedStaging('Dune.2021.1080p.WEB-DL.en.srt', 'subs')
    const files = [makeFile('Dune.2021.1080p.WEB-DL.mkv', 11), makeFile('Dune.2021.1080p.WEB-DL.en.srt', 4)]
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit))

    expect(result.extrasImported).toBe(0)
    await expect(stat(join(libraryDir, 'Dune (2021)/Dune (2021) 1080p web-dl.en.srt'))).rejects.toThrow()
  })

  it('skips an unrecognized video instead of failing the download', async () => {
    await seedStaging('random-movie.mkv')
    const qbit = makeQbit([makeFile('random-movie.mkv', 11)], stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'random-movie.mkv', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit)
    )

    expect(result.status).toBe('skipped')
    expect(result.error).toContain('no recognized media file')
  })

  it('imports the recognized episodes of a pack that ships an unrecognized video', async () => {
    const names = ['Show.S01E01.1080p.WEB-DL.mkv', 'Show.S01E02.1080p.WEB-DL.mkv', 'extras-featurette.mkv']
    for (const name of names) await seedStaging(name)
    const qbit = makeQbit(
      names.map((name) => makeFile(name, 50)),
      stagingDir
    )
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show.S01', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit)
    )

    expect(result.importedFiles).toBe(2)
    expect(result.status).toBe('done')
  })

  it('imports a single-file season pack into the first covered season', async () => {
    await seedStaging('Show.S01.1080p.WEB-DL.mkv')
    const qbit = makeQbit([makeFile('Show.S01.1080p.WEB-DL.mkv', 50)], stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show.S01.1080p.WEB-DL', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit)
    )

    expect(result.status).toBe('done')
    expect(result.importedFiles).toBe(1)
    expect(result.targetRelativePath).toContain('Show/Season 01/')
  })

  it('imports a single-file multi-season pack into the first covered season', async () => {
    await seedStaging('Show.S01-S03.1080p.WEB-DL.mkv')
    const qbit = makeQbit([makeFile('Show.S01-S03.1080p.WEB-DL.mkv', 50)], stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show.S01-S03.1080p.WEB-DL', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit)
    )

    expect(result.status).toBe('done')
    expect(result.importedFiles).toBe(1)
    expect(result.targetRelativePath).toContain('Show/Season 01/')
  })

  it('imports an anime absolute-numbered release into the series root', async () => {
    await seedStaging('Show - 1090 (1080p).mkv')
    const qbit = makeQbit([makeFile('Show - 1090 (1080p).mkv', 50)], stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show - 1090 (1080p)', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit)
    )

    expect(result.status).toBe('done')
    expect(result.importedFiles).toBe(1)
    expect(result.targetRelativePath).toBe('Show/Show - Episode 1090 1080p.mkv')
  })

  it('imports a complete-series pack into the series root', async () => {
    await seedStaging('Show Complete Series.mkv')
    const qbit = makeQbit([makeFile('Show Complete Series.mkv', 50)], stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show Complete Series', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit)
    )

    expect(result.status).toBe('done')
    expect(result.importedFiles).toBe(1)
    expect(result.targetRelativePath).toBe('Show/Show - Complete.mkv')
  })

  it('cleans up the torrent leftovers in move mode when enabled', async () => {
    const folder = 'Dune.2021.1080p.WEB-DL'
    await seedStaging(`${folder}/Dune.2021.1080p.WEB-DL.mkv`)
    await seedStaging(`${folder}/Dune.2021.1080p.WEB-DL.sample.mkv`, 'sample')
    await seedStaging(`${folder}/Dune.2021.1080p.WEB-DL.en.srt`, 'subs')
    await seedStaging(`${folder}/poster.jpg`, 'jpeg')
    await seedStaging(`${folder}/release.screens`, 'screens')
    await seedStaging(`${folder}/release.url`, 'url')
    await seedStaging(`${folder}/release.txt`, 'txt')
    const files = [
      makeFile(`${folder}/Dune.2021.1080p.WEB-DL.mkv`, 11),
      makeFile(`${folder}/Dune.2021.1080p.WEB-DL.sample.mkv`, 6),
      makeFile(`${folder}/Dune.2021.1080p.WEB-DL.en.srt`, 4),
      makeFile(`${folder}/poster.jpg`, 4),
      makeFile(`${folder}/release.screens`, 7),
      makeFile(`${folder}/release.url`, 3),
      makeFile(`${folder}/release.txt`, 3)
    ]
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob(),
      makeDeps(qbit, { importMode: 'move', cleanupStaging: true })
    )

    expect(result.status).toBe('done')
    // Sample, subtitle and junk are all removed: move mode leaves nothing to
    // seed, so the whole release folder is pruned. The staging root stays.
    await expect(stat(join(stagingDir, folder))).rejects.toThrow()
    expect((await stat(stagingDir)).isDirectory()).toBe(true)
    expect(await readFile(join(libraryDir, 'Dune (2021)/Dune (2021) 1080p web-dl.mkv'), 'utf8')).toBe('video-bytes')
  })

  it('keeps the torrent leftovers in move mode when cleanup is off', async () => {
    const folder = 'Dune.2021.1080p.WEB-DL'
    await seedStaging(`${folder}/Dune.2021.1080p.WEB-DL.mkv`)
    await seedStaging(`${folder}/poster.jpg`, 'jpeg')
    const files = [makeFile(`${folder}/Dune.2021.1080p.WEB-DL.mkv`, 11), makeFile(`${folder}/poster.jpg`, 4)]
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit, { importMode: 'move' }))

    expect(result.status).toBe('done')
    expect(await readFile(join(stagingDir, folder, 'poster.jpg'), 'utf8')).toBe('jpeg')
  })

  it('does not clean up outside move mode', async () => {
    const folder = 'Dune.2021.1080p.WEB-DL'
    await seedStaging(`${folder}/Dune.2021.1080p.WEB-DL.mkv`)
    await seedStaging(`${folder}/poster.jpg`, 'jpeg')
    const files = [makeFile(`${folder}/Dune.2021.1080p.WEB-DL.mkv`, 11), makeFile(`${folder}/poster.jpg`, 4)]
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob(),
      makeDeps(qbit, { importMode: 'copy', cleanupStaging: true })
    )

    expect(result.status).toBe('done')
    expect(await readFile(join(stagingDir, folder, 'poster.jpg'), 'utf8')).toBe('jpeg')
  })

  it('keeps the leftovers when the import was only partially successful', async () => {
    const names = ['Show.S01E01.1080p.WEB-DL.mkv', 'Show.S01E02.1080p.WEB-DL.mkv']
    await seedStaging(names[0]!)
    await seedStaging('poster.jpg', 'jpeg')
    const files = [...names.map((name) => makeFile(name, 50)), makeFile('poster.jpg', 4)]
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show.S01', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit, { importMode: 'move', cleanupStaging: true })
    )

    expect(result.status).toBe('failed')
    expect(await readFile(join(stagingDir, 'poster.jpg'), 'utf8')).toBe('jpeg')
  })

  it('removes the torrent after a partial move import as soon as a file was moved', async () => {
    const names = ['Show.S01E01.1080p.WEB-DL.mkv', 'Show.S01E02.1080p.WEB-DL.mkv']
    await seedStaging(names[0]!)
    const files = names.map((name) => makeFile(name, 50))
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show.S01', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit, { importMode: 'move' })
    )

    expect(result.status).toBe('failed')
    expect(result.importedFiles).toBe(1)
    expect(qbit.deleteTorrent).toHaveBeenCalledWith('h', false)
  })

  it('removes the torrent from qBittorrent without its files after a successful move import', async () => {
    const folder = 'Dune.2021.1080p.WEB-DL'
    await seedStaging(`${folder}/Dune.2021.1080p.WEB-DL.mkv`)
    const files = [makeFile(`${folder}/Dune.2021.1080p.WEB-DL.mkv`, 11)]
    const qbit = makeQbit(files, stagingDir)

    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit, { importMode: 'move' }))

    expect(result.status).toBe('done')
    expect(qbit.deleteTorrent).toHaveBeenCalledWith('h', false)
    expect(await readFile(join(libraryDir, 'Dune (2021)/Dune (2021) 1080p web-dl.mkv'), 'utf8')).toBe('video-bytes')
  })

  it('keeps the torrent when the import did not move the files', async () => {
    const folder = 'Dune.2021.1080p.WEB-DL'
    await seedStaging(`${folder}/Dune.2021.1080p.WEB-DL.mkv`)
    const files = [makeFile(`${folder}/Dune.2021.1080p.WEB-DL.mkv`, 11)]
    const qbit = makeQbit(files, stagingDir)

    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit, { importMode: 'copy' }))

    expect(result.status).toBe('done')
    expect(qbit.deleteTorrent).not.toHaveBeenCalled()
  })

  it('does not fail the import when qBittorrent refuses to remove the torrent', async () => {
    const folder = 'Dune.2021.1080p.WEB-DL'
    await seedStaging(`${folder}/Dune.2021.1080p.WEB-DL.mkv`)
    const files = [makeFile(`${folder}/Dune.2021.1080p.WEB-DL.mkv`, 11)]
    const qbit = makeQbit(files, stagingDir)
    qbit.deleteTorrent.mockRejectedValueOnce(new Error('qBittorrent API error 500: boom'))

    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit, { importMode: 'move' }))

    expect(result.status).toBe('done')
    expect(qbit.deleteTorrent).toHaveBeenCalledWith('h', false)
  })

  it('fails the import when a subtitle cannot be placed in the library', async () => {
    await seedStaging('Dune.2021.1080p.WEB-DL.mkv')
    await seedStaging('Dune.2021.1080p.WEB-DL.en.srt', 'subs')
    await seedStaging('poster.jpg', 'jpeg')
    // A non-EEXIST failure while committing the subtitle would previously be
    // swallowed, leaving the file in staging with no library copy.
    mockFailRenameFor.value = 'Dune.2021.1080p.WEB-DL.en.srt'
    const files = [
      makeFile('Dune.2021.1080p.WEB-DL.mkv', 11),
      makeFile('Dune.2021.1080p.WEB-DL.en.srt', 4),
      makeFile('poster.jpg', 4)
    ]
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob(),
      makeDeps(qbit, { importExtraFiles: true, importMode: 'move', cleanupStaging: true })
    )

    expect(result.status).toBe('failed')
    expect(result.error).toContain('extra file import failed')
    expect(result.extrasImported).toBe(0)
    // Cleanup must not delete the rest of the release after a partial import.
    expect(await readFile(join(stagingDir, 'poster.jpg'), 'utf8')).toBe('jpeg')
  })

  it('does not fail when the extra target already exists', async () => {
    await seedStaging('Dune.2021.1080p.WEB-DL.mkv')
    await seedStaging('Dune.2021.1080p.WEB-DL.en.srt', 'subs')
    await mkdir(join(libraryDir, 'Dune (2021)'), { recursive: true })
    await writeFile(join(libraryDir, 'Dune (2021)/Dune (2021) 1080p web-dl.en.srt'), 'existing')
    const files = [makeFile('Dune.2021.1080p.WEB-DL.mkv', 11), makeFile('Dune.2021.1080p.WEB-DL.en.srt', 4)]
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit, { importExtraFiles: true }))

    expect(result.status).toBe('done')
    expect(result.extrasImported).toBe(0)
  })

  it('imports two downloads of the same release only once', async () => {
    await seedStaging('Dune.2021.1080p.WEB-DL.mkv', 'first')
    const files = [makeFile('Dune.2021.1080p.WEB-DL.mkv', 11)]
    const first = makeQbit(files, stagingDir)
    const second = makeQbit(files, stagingDir)
    await writeFile(join(stagingDir, 'Dune.2021.1080p.WEB-DL.mkv'), 'second')

    const results = await Promise.all([
      organizeCompletedDownload('h1', makeJob({ downloadId: 'dl-1' }), makeDeps(first)),
      organizeCompletedDownload('h2', makeJob({ downloadId: 'dl-2' }), makeDeps(second))
    ])

    expect(results.map((result) => result.status).sort()).toEqual(['done', 'skipped'])
    expect(await readFile(join(libraryDir, 'Dune (2021)/Dune (2021) 1080p web-dl.mkv'), 'utf8')).toMatch(
      /^(first|second)$/
    )
  })
})
