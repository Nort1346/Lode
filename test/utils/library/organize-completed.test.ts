import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

vi.mock('#server/utils/tmdb', () => ({
  getMovieDetails: vi.fn(),
  getTvShowDetails: vi.fn()
}))

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
    getTorrentFiles: vi.fn(async () => files)
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

  it('ignores extra files when the setting is off', async () => {
    await seedStaging('Dune.2021.1080p.WEB-DL.mkv')
    await seedStaging('Dune.2021.1080p.WEB-DL.en.srt', 'subs')
    const files = [makeFile('Dune.2021.1080p.WEB-DL.mkv', 11), makeFile('Dune.2021.1080p.WEB-DL.en.srt', 4)]
    const qbit = makeQbit(files, stagingDir)
    const result = await organizeCompletedDownload('h', makeJob(), makeDeps(qbit))

    expect(result.extrasImported).toBe(0)
    await expect(stat(join(libraryDir, 'Dune (2021)/Dune (2021) 1080p web-dl.en.srt'))).rejects.toThrow()
  })

  it('fails on unrecognized episode naming', async () => {
    await seedStaging('random-movie.mkv')
    const qbit = makeQbit([makeFile('random-movie.mkv', 11)], stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'random-movie.mkv', label: 'Show', mediaType: 'tv' }),
      makeDeps(qbit)
    )

    expect(result.status).toBe('failed')
    expect(result.error).toContain('unrecognized episode')
  })

  it('reports a partially imported pack as failed', async () => {
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
    expect(result.status).toBe('failed')
    expect(result.error).toContain('unrecognized episode')
  })
})
