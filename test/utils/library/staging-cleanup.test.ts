import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupStagingLeftovers, pruneStagingTree } from '#server/utils/library/staging-cleanup'
import type { TorrentFile } from '#server/types/torrent'

let workdir = ''
let stagingDir = ''

beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), 'lode-cleanup-'))
  stagingDir = join(workdir, 'staging')
  await mkdir(stagingDir, { recursive: true })
})

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true })
})

function makeFile(name: string, size = 10): TorrentFile {
  return { index: 0, name, size, progress: 1, priority: 1 }
}

async function seed(relative: string, content = 'x'): Promise<void> {
  const full = join(stagingDir, relative)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content)
}

describe('cleanupStagingLeftovers', () => {
  it('removes the listed files and prunes the emptied release folder', async () => {
    const saveDir = join(stagingDir, 'Dune.2021.1080p.WEB-DL')
    await seed('Dune.2021.1080p.WEB-DL/poster.jpg', 'jpeg')
    await seed('Dune.2021.1080p.WEB-DL/release.url', 'url')

    const removed = await cleanupStagingLeftovers({
      files: [makeFile('poster.jpg'), makeFile('release.url')],
      saveDir,
      stagingDir
    })

    expect(removed).toBe(2)
    await expect(stat(saveDir)).rejects.toThrow()
    // The staging root is never removed.
    expect((await stat(stagingDir)).isDirectory()).toBe(true)
  })

  it('keeps a file the torrent does not list', async () => {
    const saveDir = join(stagingDir, 'Dune.2021.1080p.WEB-DL')
    await seed('Dune.2021.1080p.WEB-DL/poster.jpg', 'jpeg')
    await seed('Dune.2021.1080p.WEB-DL/keep.srt', 'srt')

    const removed = await cleanupStagingLeftovers({
      files: [makeFile('poster.jpg')],
      saveDir,
      stagingDir
    })

    expect(removed).toBe(1)
    expect(await readFile(join(saveDir, 'keep.srt'), 'utf8')).toBe('srt')
    await expect(stat(join(saveDir, 'poster.jpg'))).rejects.toThrow()
  })

  it('removes the rest of the release, including unimported video and subtitles', async () => {
    const saveDir = join(stagingDir, 'Dune.2021.1080p.WEB-DL')
    const names = ['featurette.mkv', 'movie.srt', 'movie.nfo', 'poster.jpg']
    for (const name of names) await seed(`Dune.2021.1080p.WEB-DL/${name}`, name)

    const removed = await cleanupStagingLeftovers({
      files: names.map((name) => makeFile(name)),
      saveDir,
      stagingDir
    })

    expect(removed).toBe(4)
    await expect(stat(saveDir)).rejects.toThrow()
  })

  it('returns 0 when the release folder is already gone', async () => {
    const removed = await cleanupStagingLeftovers({
      files: [makeFile('poster.jpg')],
      saveDir: join(stagingDir, 'missing'),
      stagingDir
    })

    expect(removed).toBe(0)
  })

  it('ignores files that are already gone', async () => {
    const saveDir = join(stagingDir, 'Dune.2021.1080p.WEB-DL')
    await seed('Dune.2021.1080p.WEB-DL/poster.jpg', 'jpeg')

    const removed = await cleanupStagingLeftovers({
      files: [makeFile('poster.jpg'), makeFile('missing.txt')],
      saveDir,
      stagingDir
    })

    expect(removed).toBe(1)
    // The folder emptied by the cleanup is still pruned.
    await expect(stat(saveDir)).rejects.toThrow()
  })

  it('refuses to clean up a save dir outside staging', async () => {
    const outsideDir = join(workdir, 'library', 'Dune (2021)')
    await mkdir(outsideDir, { recursive: true })
    await writeFile(join(outsideDir, 'poster.jpg'), 'jpeg')

    const removed = await cleanupStagingLeftovers({
      files: [makeFile('poster.jpg')],
      saveDir: outsideDir,
      stagingDir
    })

    expect(removed).toBe(0)
    expect(await readFile(join(outsideDir, 'poster.jpg'), 'utf8')).toBe('jpeg')
  })

  it('ignores paths that would escape the save dir', async () => {
    const saveDir = join(stagingDir, 'release')
    await mkdir(saveDir, { recursive: true })
    await seed('outside.jpg', 'secret')

    const removed = await cleanupStagingLeftovers({
      files: [makeFile('../outside.jpg')],
      saveDir,
      stagingDir
    })

    expect(removed).toBe(0)
    expect(await readFile(join(stagingDir, 'outside.jpg'), 'utf8')).toBe('secret')
  })

  it('prunes an empty directory the torrent lists as an entry', async () => {
    const saveDir = join(stagingDir, 'release')
    await mkdir(join(saveDir, 'sub'), { recursive: true })

    const removed = await cleanupStagingLeftovers({
      files: [makeFile('sub')],
      saveDir,
      stagingDir
    })

    expect(removed).toBe(0)
    await expect(stat(saveDir)).rejects.toThrow()
  })

  it('keeps a directory that still holds a file the torrent does not list', async () => {
    const saveDir = join(stagingDir, 'release')
    await mkdir(join(saveDir, 'sub'), { recursive: true })
    await writeFile(join(saveDir, 'sub', 'keep.txt'), 'keep')

    const removed = await cleanupStagingLeftovers({
      files: [makeFile('sub')],
      saveDir,
      stagingDir
    })

    expect(removed).toBe(0)
    expect(await readFile(join(saveDir, 'sub', 'keep.txt'), 'utf8')).toBe('keep')
  })

  it('prunes the empty subfolders a move import left behind', async () => {
    // The import moved the video and the subtitle out; only the (now empty)
    // folder tree remains.
    const saveDir = join(stagingDir, 'Dune.2021.1080p.WEB-DL')
    await mkdir(join(saveDir, 'Subs'), { recursive: true })

    const removed = await cleanupStagingLeftovers({
      files: [makeFile('Dune.2021.1080p.WEB-DL.mkv'), makeFile('Subs/en.srt')],
      saveDir,
      stagingDir
    })

    expect(removed).toBe(0)
    await expect(stat(saveDir)).rejects.toThrow()
  })

  it('prunes the category dir when the last release leaves it empty', async () => {
    const saveDir = join(stagingDir, 'Movies', 'Dune.2021.1080p.WEB-DL')
    await mkdir(saveDir, { recursive: true })

    const removed = await cleanupStagingLeftovers({
      files: [makeFile('Dune.2021.1080p.WEB-DL.mkv')],
      saveDir,
      stagingDir
    })

    expect(removed).toBe(0)
    await expect(stat(join(stagingDir, 'Movies'))).rejects.toThrow()
    // The staging root is never removed.
    expect((await stat(stagingDir)).isDirectory()).toBe(true)
  })

  it('keeps a category dir that still holds another release', async () => {
    const saveDir = join(stagingDir, 'Movies', 'Dune.2021.1080p.WEB-DL')
    await mkdir(saveDir, { recursive: true })
    await seed('Movies/Other.2020.mkv', 'video')

    const removed = await cleanupStagingLeftovers({
      files: [makeFile('Dune.2021.1080p.WEB-DL.mkv')],
      saveDir,
      stagingDir
    })

    expect(removed).toBe(0)
    await expect(stat(saveDir)).rejects.toThrow()
    expect(await readFile(join(stagingDir, 'Movies', 'Other.2020.mkv'), 'utf8')).toBe('video')
  })
})

describe('pruneStagingTree', () => {
  it('refuses to prune outside the staging root', async () => {
    const outsideDir = join(workdir, 'library', 'Release')
    await mkdir(outsideDir, { recursive: true })
    await writeFile(join(outsideDir, 'poster.jpg'), 'jpeg')

    await pruneStagingTree(outsideDir, stagingDir)

    expect(await readFile(join(outsideDir, 'poster.jpg'), 'utf8')).toBe('jpeg')
  })

  it('is a no-op when the release folder is already gone', async () => {
    await expect(pruneStagingTree(join(stagingDir, 'missing'), stagingDir)).resolves.toBeUndefined()
  })

  it('never removes the staging root even when saveDir is the root itself', async () => {
    await mkdir(join(stagingDir, 'release'), { recursive: true })

    await pruneStagingTree(stagingDir, stagingDir)

    await expect(stat(join(stagingDir, 'release'))).rejects.toThrow()
    expect((await stat(stagingDir)).isDirectory()).toBe(true)
  })
})
