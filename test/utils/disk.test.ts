import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkDiskSpace, checkAllDisks, findTargetDisk } from '#server/utils/disk'

const mockExec = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  exec: mockExec
}))

vi.mock('node:util', () => ({
  promisify:
    () =>
    (...args: unknown[]) =>
      mockExec(...args)
}))

describe('checkDiskSpace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns correct disk info when df succeeds', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/disk1s5   482797652 348296532 134501120  73% /`,
      stderr: ''
    })

    const result = await checkDiskSpace('/media', 7)

    expect(result.available).toBe(true)
    expect(result.totalBytes).toBe(482797652 * 1024)
    expect(result.freeBytes).toBe(134501120 * 1024)
    expect(result.usedBytes).toBe(result.totalBytes - result.freeBytes)
    expect(result.usedPercent).toBe(72)
    expect(result.hasEnoughSpace).toBe(true)
    expect(result.path).toBe('/media')
  })

  it('formats sizes correctly', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/disk1s5   104857600  52428800  52428800  50% /`,
      stderr: ''
    })

    const result = await checkDiskSpace('/media', 7)

    expect(result.totalFormatted).toBe('100.0 GB')
    expect(result.freeFormatted).toBe('50.0 GB')
    expect(result.usedFormatted).toBe('50.0 GB')
  })

  it('returns unavailable when df fails', async () => {
    mockExec.mockRejectedValue(new Error('Command failed'))

    const result = await checkDiskSpace('/media', 7)

    expect(result.available).toBe(false)
    expect(result.totalBytes).toBe(0)
    expect(result.freeBytes).toBe(0)
    expect(result.usedBytes).toBe(0)
    expect(result.hasEnoughSpace).toBe(false)
  })

  it('returns unavailable when df output is malformed', async () => {
    mockExec.mockResolvedValue({ stdout: 'invalid output', stderr: '' })

    const result = await checkDiskSpace('/media', 7)

    expect(result.available).toBe(false)
  })

  it('handles low free space correctly', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/disk1s5   10485760  10000000    485760  96% /`,
      stderr: ''
    })

    const result = await checkDiskSpace('/media', 7)

    expect(result.hasEnoughSpace).toBe(false)
    expect(result.usedPercent).toBe(95)
  })
})

describe('checkAllDisks', () => {
  it('checks multiple disks', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/disk1s5   104857600  52428800  52428800  50% /`,
      stderr: ''
    })

    const results = await checkAllDisks(['/media', '/data'], 7)

    expect(results).toHaveLength(2)
    results.forEach((r) => {
      expect(r.available).toBe(true)
    })
  })

  it('filters empty paths', async () => {
    const results = await checkAllDisks(['/media', '', '  ', '/data'], 7)
    expect(results).toHaveLength(2)
  })
})

describe('findTargetDisk', () => {
  it('finds matching disk for path', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/disk1s5   104857600  52428800  52428800  50% /`,
      stderr: ''
    })

    const result = await findTargetDisk(['/media', '/data'], '/media/Movies', 7)

    expect(result).not.toBeNull()
    expect(result?.path).toBe('/media')
  })

  it('returns null for non-matching path', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/disk1s5   104857600  52428800  52428800  50% /`,
      stderr: ''
    })

    const result = await findTargetDisk(['/media', '/data'], '/other/path', 7)

    expect(result).toBeNull()
  })
})
