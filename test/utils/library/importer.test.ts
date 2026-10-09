import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildAbsoluteTarget,
  ensureDir,
  importSingleFile,
  resolveLibraryDir,
  resolveStagingDir
} from '#server/utils/library/importer'

let workdir = ''

beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), 'lode-import-'))
})

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true })
})

async function seedSource(name = 'movie.mkv', content = 'video-bytes'): Promise<string> {
  const source = join(workdir, 'staging', name)
  await ensureDir(join(workdir, 'staging'))
  await writeFile(source, content)
  return source
}

describe('ensureDir', () => {
  it('creates nested directories', async () => {
    const nested = join(workdir, 'a', 'b', 'c')
    await ensureDir(nested)
    const info = await stat(nested)
    expect(info.isDirectory()).toBe(true)
  })
})

describe('importSingleFile', () => {
  it('hardlinks on the same filesystem (same inode)', async () => {
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')

    const result = await importSingleFile(source, target, 'hardlink')

    expect(result.method).toBe('hardlink')
    expect(await readFile(target, 'utf8')).toBe('video-bytes')
    const [srcStat, dstStat] = await Promise.all([stat(source), stat(target)])
    expect(dstStat.ino).toBe(srcStat.ino)
  })

  it('copies bytes with copy mode', async () => {
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')

    const result = await importSingleFile(source, target, 'copy')

    expect(result.method).toBe('copy')
    expect(await readFile(target, 'utf8')).toBe('video-bytes')
    const [srcStat, dstStat] = await Promise.all([stat(source), stat(target)])
    expect(dstStat.ino).not.toBe(srcStat.ino)
  })

  it('moves the file with move mode', async () => {
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')

    const result = await importSingleFile(source, target, 'move')

    expect(result.method).toBe('move')
    expect(await readFile(target, 'utf8')).toBe('video-bytes')
    await expect(stat(source)).rejects.toThrow()
  })

  it('leaves no .partial file behind', async () => {
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')

    await importSingleFile(source, target, 'copy')

    await expect(stat(`${target}.partial`)).rejects.toThrow()
  })
})

describe('resolveStagingDir', () => {
  const config = {
    savePathMovies: '/media/Movies',
    savePathSeries: '/media/Series',
    downloadPathMovies: '/media/downloads/movies',
    downloadPathSeries: '/media/downloads/series'
  }

  it('prefers the staging dir when configured', () => {
    expect(resolveStagingDir('movies', config)).toBe('/media/downloads/movies')
    expect(resolveStagingDir('series', config)).toBe('/media/downloads/series')
  })

  it('falls back to the library dir without staging', () => {
    const noStaging = { ...config, downloadPathMovies: '', downloadPathSeries: '' }
    expect(resolveStagingDir('movies', noStaging)).toBe('/media/Movies')
    expect(resolveStagingDir('series', noStaging)).toBe('/media/Series')
  })
})

describe('resolveLibraryDir', () => {
  it('maps savePath keys to library dirs', () => {
    expect(resolveLibraryDir('movies', { savePathMovies: '/m', savePathSeries: '/s' })).toBe('/m')
    expect(resolveLibraryDir('series', { savePathMovies: '/m', savePathSeries: '/s' })).toBe('/s')
  })

  it('maps unknown keys to movies', () => {
    expect(resolveLibraryDir('games', { savePathMovies: '/m', savePathSeries: '/s' })).toBe('/m')
  })
})

describe('buildAbsoluteTarget', () => {
  it('joins library dir and relative path', () => {
    expect(buildAbsoluteTarget('/media/Movies', 'Dune (2021)/Dune (2021).mkv')).toBe(
      join('/media/Movies', 'Dune (2021)/Dune (2021).mkv')
    )
  })
})
