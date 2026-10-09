import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('#server/utils/tmdb', () => ({
  getMovieDetails: vi.fn(),
  getTvShowDetails: vi.fn()
}))

import { organizeCompletedDownload } from '#server/utils/library/organize-completed'
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

function makeQbit(files: TorrentFile[], savePath: string, renameFile = vi.fn(async () => {})) {
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
    renameFile
  }
}

async function seedStaging(name: string): Promise<void> {
  const full = join(stagingDir, name)
  const { mkdir } = await import('node:fs/promises')
  const { dirname } = await import('node:path')
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, 'video-bytes')
}

describe('organizeCompletedDownload', () => {
  it('skips non-movie/series libraries', async () => {
    const qbit = makeQbit([], stagingDir)
    const result = await organizeCompletedDownload('h', makeJob({ savePath: 'games' }), {
      qbit,
      libraryMovies: libraryDir,
      librarySeries: libraryDir,
      importMode: 'hardlink'
    })
    expect(result.status).toBe('skipped')
    expect(qbit.getTorrentFiles).not.toHaveBeenCalled()
  })

  it('fails when no video file is present', async () => {
    const qbit = makeQbit([makeFile('poster.jpg')], stagingDir)
    const result = await organizeCompletedDownload('h', makeJob(), {
      qbit,
      libraryMovies: libraryDir,
      librarySeries: libraryDir,
      importMode: 'hardlink'
    })
    expect(result.status).toBe('failed')
    expect(result.error).toContain('no video file')
  })

  it('imports a movie across staging and library dirs', async () => {
    await seedStaging('Dune.2021.1080p.WEB-DL.mkv')
    const qbit = makeQbit([makeFile('Dune.2021.1080p.WEB-DL.mkv', 11)], stagingDir)
    const result = await organizeCompletedDownload('h', makeJob(), {
      qbit,
      libraryMovies: libraryDir,
      librarySeries: libraryDir,
      importMode: 'copy'
    })
    expect(result.status).toBe('done')
    expect(result.targetRelativePath).toBe('Dune (2021)/Dune (2021) 1080p web-dl.mkv')
    expect(await readFile(join(libraryDir, result.targetRelativePath ?? ''), 'utf8')).toBe('video-bytes')
  })

  it('renames in place via qBittorrent when already inside the target folder', async () => {
    const folder = join(libraryDir, 'Dune (2021)')
    const qbit = makeQbit(
      [makeFile('Dune (2021)/Dune.2021.1080p.WEB-DL.mkv', 11)],
      libraryDir,
      vi.fn(async () => {})
    )
    const result = await organizeCompletedDownload('h', makeJob(), {
      qbit,
      libraryMovies: libraryDir,
      librarySeries: libraryDir,
      importMode: 'hardlink'
    })
    expect(result.status).toBe('done')
    expect(folder.endsWith('Dune (2021)')).toBe(true)
    expect(qbit.renameFile).toHaveBeenCalledWith(
      'h',
      'Dune (2021)/Dune.2021.1080p.WEB-DL.mkv',
      'Dune (2021) 1080p web-dl.mkv'
    )
  })

  it('imports a tv episode with season folder', async () => {
    await seedStaging('Show.S01E02.1080p.WEB-DL.mkv')
    const qbit = makeQbit([makeFile('Show.S01E02.1080p.WEB-DL.mkv', 11)], stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'Show.S01E02.1080p.WEB-DL.mkv', label: 'Show', mediaType: 'tv' }),
      { qbit, libraryMovies: libraryDir, librarySeries: libraryDir, importMode: 'copy' }
    )
    expect(result.status).toBe('done')
    expect(result.targetRelativePath).toBe('Show/Season 01/Show - S01E02 1080p web-dl.mkv')
  })

  it('fails on unrecognized episode naming', async () => {
    await seedStaging('random-movie.mkv')
    const qbit = makeQbit([makeFile('random-movie.mkv', 11)], stagingDir)
    const result = await organizeCompletedDownload(
      'h',
      makeJob({ savePath: 'series', torrentName: 'random-movie.mkv', label: 'Show', mediaType: 'tv' }),
      { qbit, libraryMovies: libraryDir, librarySeries: libraryDir, importMode: 'copy' }
    )
    expect(result.status).toBe('failed')
    expect(result.error).toContain('unrecognized episode')
  })
})
