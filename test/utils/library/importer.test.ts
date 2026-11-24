import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildAbsoluteTarget,
  ensureDir,
  importSingleFile,
  resolveLibraryDir,
  resolveStagingDir
} from '#server/utils/library/importer'

// Hardlink support depends on the filesystem (EXDEV, EPERM on SMB/NFS, ...),
// so the link call is mocked while every other fs helper stays real.
const mockLink = vi.hoisted(() => vi.fn())
const realLink = vi.hoisted(() => ({ fn: undefined as unknown as typeof import('node:fs/promises').link }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  realLink.fn = actual.link
  mockLink.mockImplementation(actual.link)
  return { ...actual, link: mockLink }
})

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
    expect(result.bytes).toBe(0)
    expect(await readFile(target, 'utf8')).toBe('video-bytes')
    const [srcStat, dstStat] = await Promise.all([stat(source), stat(target)])
    expect(dstStat.ino).toBe(srcStat.ino)
  })

  it('copies bytes with copy mode', async () => {
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')

    const result = await importSingleFile(source, target, 'copy')

    expect(result.method).toBe('copy')
    expect(result.bytes).toBe('video-bytes'.length)
    expect(await readFile(target, 'utf8')).toBe('video-bytes')
    const [srcStat, dstStat] = await Promise.all([stat(source), stat(target)])
    expect(dstStat.ino).not.toBe(srcStat.ino)
  })

  it('falls back to copy when the filesystem rejects hardlinks', async () => {
    mockLink.mockRejectedValueOnce(Object.assign(new Error('operation not permitted'), { code: 'EPERM' }))
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')

    const result = await importSingleFile(source, target, 'hardlink')

    expect(result.method).toBe('copy')
    expect(result.bytes).toBe('video-bytes'.length)
    expect(await readFile(target, 'utf8')).toBe('video-bytes')
  })

  it('falls back to reserve+rename when hardlinking returns EIO', async () => {
    mockLink.mockRejectedValueOnce(Object.assign(new Error('i/o error'), { code: 'EIO' }))
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')

    const result = await importSingleFile(source, target, 'copy')

    expect(result.method).toBe('copy')
    expect(await readFile(target, 'utf8')).toBe('video-bytes')
  })

  it('keeps EEXIST so a duplicate target is skipped instead of overwritten', async () => {
    mockLink.mockRejectedValueOnce(Object.assign(new Error('file exists'), { code: 'EEXIST' }))
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')

    await expect(importSingleFile(source, target, 'hardlink')).rejects.toMatchObject({ code: 'EEXIST' })
  })

  it('moves the file with move mode', async () => {
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')

    const result = await importSingleFile(source, target, 'move')

    expect(result.method).toBe('move')
    expect(result.bytes).toBe('video-bytes'.length)
    expect(await readFile(target, 'utf8')).toBe('video-bytes')
    await expect(stat(source)).rejects.toThrow()
  })

  it('leaves no .partial file behind', async () => {
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')

    await importSingleFile(source, target, 'copy')

    await expect(stat(`${target}.partial`)).rejects.toThrow()
  })

  it('publishes the complete file in one step, with no empty target window', async () => {
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')
    const published: string[] = []
    mockLink.mockImplementationOnce(async (from: string, to: string) => {
      published.push(await readFile(from, 'utf8'))
      return realLink.fn(from, to)
    })

    await importSingleFile(source, target, 'copy')

    expect(published).toEqual(['video-bytes'])
    expect(await readFile(target, 'utf8')).toBe('video-bytes')
  })

  it('reports the copied byte count through the progress callback', async () => {
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')
    const reports: number[] = []

    await importSingleFile(source, target, 'copy', (bytes) => reports.push(bytes))

    expect(reports.length).toBeGreaterThan(0)
    expect(reports).toContain('video-bytes'.length)
  })

  it('refuses to overwrite an existing target in copy mode', async () => {
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')
    await ensureDir(join(workdir, 'library'))
    await writeFile(target, 'original')

    await expect(importSingleFile(source, target, 'copy')).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(target, 'utf8')).toBe('original')
  })

  it('refuses to overwrite an existing target in move mode', async () => {
    const source = await seedSource()
    const target = join(workdir, 'library', 'Dune (2021).mkv')
    await ensureDir(join(workdir, 'library'))
    await writeFile(target, 'original')

    await expect(importSingleFile(source, target, 'move')).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(target, 'utf8')).toBe('original')
    expect(await readFile(source, 'utf8')).toBe('video-bytes')
  })

  it('imports only one of two overlapping copies of the same release', async () => {
    const first = await seedSource('first.mkv', 'first-bytes')
    const second = await seedSource('second.mkv', 'second-bytes')
    const target = join(workdir, 'library', 'Dune (2021).mkv')

    const outcomes = await Promise.allSettled([
      importSingleFile(first, target, 'copy'),
      importSingleFile(second, target, 'copy')
    ])

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1)
    expect(await readFile(target, 'utf8')).toMatch(/^(first-bytes|second-bytes)$/)
    expect((await readdir(join(workdir, 'library'))).some((name) => name.includes('.partial'))).toBe(false)
  })
})

describe('resolveStagingDir', () => {
  const config = {
    downloadPathMovies: '/media/downloads/movies',
    downloadPathSeries: '/media/downloads/series'
  }

  it('returns the staging dir when configured', () => {
    expect(resolveStagingDir('movies', config)).toBe('/media/downloads/movies')
    expect(resolveStagingDir('series', config)).toBe('/media/downloads/series')
  })

  it('returns null without staging so callers fall back to the library dir', () => {
    const noStaging = { downloadPathMovies: '', downloadPathSeries: '' }
    expect(resolveStagingDir('movies', noStaging)).toBeNull()
    expect(resolveStagingDir('series', noStaging)).toBeNull()
  })

  it('returns null for non-media categories', () => {
    expect(resolveStagingDir('games', config)).toBeNull()
    expect(resolveStagingDir('books', config)).toBeNull()
    expect(resolveStagingDir('music', config)).toBeNull()
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
