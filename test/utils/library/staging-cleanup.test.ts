import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupStagingLeftovers } from '#server/utils/library/staging-cleanup'
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
    await seed('Dune.2021.1080p.WEB-DL/keep.nfo', 'nfo')

    const removed = await cleanupStagingLeftovers({
      files: [makeFile('poster.jpg')],
      saveDir,
      stagingDir
    })

    expect(removed).toBe(1)
    expect(await readFile(join(saveDir, 'keep.nfo'), 'utf8')).toBe('nfo')
    await expect(stat(join(saveDir, 'poster.jpg'))).rejects.toThrow()
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
    await seed('outside.jpg', 'secret')

    const removed = await cleanupStagingLeftovers({
      files: [makeFile('../outside.jpg')],
      saveDir,
      stagingDir
    })

    expect(removed).toBe(0)
    expect(await readFile(join(stagingDir, 'outside.jpg'), 'utf8')).toBe('secret')
  })

  it('skips directories listed as entries', async () => {
    const saveDir = join(stagingDir, 'release')
    await mkdir(join(saveDir, 'sub'), { recursive: true })

    const removed = await cleanupStagingLeftovers({
      files: [makeFile('sub')],
      saveDir,
      stagingDir
    })

    expect(removed).toBe(0)
    expect((await stat(join(saveDir, 'sub'))).isDirectory()).toBe(true)
  })
})
