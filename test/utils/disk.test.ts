import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkDiskSpace, checkAllDisks, findTargetDisk, checkTargetDiskForDownload } from '#server/utils/disk'

const mockExec = vi.hoisted(() => vi.fn())
const mockGetReposAsync = vi.hoisted(() => vi.fn())
const mockUseRuntimeConfig = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  exec: mockExec
}))

vi.mock('node:util', () => ({
  promisify:
    () =>
    (...args: unknown[]) =>
      mockExec(...args)
}))

vi.mock('#server/repositories', () => ({
  getReposAsync: mockGetReposAsync
}))

vi.stubGlobal('useRuntimeConfig', mockUseRuntimeConfig)

function stubDiskSettings(enabled: string | undefined = undefined, minFreeGb: string | undefined = undefined) {
  mockGetReposAsync.mockResolvedValue({
    settings: {
      get: vi.fn(async (key: string) =>
        key === 'disk_check_enabled' ? enabled : key === 'disk_min_free_gb' ? minFreeGb : undefined
      )
    }
  })
  mockUseRuntimeConfig.mockReturnValue({ diskSpaceCheckEnabled: true, minFreeSpaceGb: 7 })
}

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

  it('blocks when remaining space after the download falls below the minimum', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/disk1s5   104857600  94371840  10485760  90% /`,
      stderr: ''
    })

    const result = await checkDiskSpace('/media', 7, 5 * 1024 ** 3)

    expect(result.available).toBe(true)
    expect(result.freeBytes).toBe(10 * 1024 ** 3)
    expect(result.hasEnoughSpace).toBe(false)
  })

  it('allows when remaining space after the download meets the minimum', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/disk1s5   104857600  92274688  12582912  88% /`,
      stderr: ''
    })

    const result = await checkDiskSpace('/media', 7, 5 * 1024 ** 3)

    expect(result.available).toBe(true)
    expect(result.freeBytes).toBe(12 * 1024 ** 3)
    expect(result.hasEnoughSpace).toBe(true)
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

  it('falls back to the target path when no configured disk matches', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/disk1s5   104857600  52428800  52428800  50% /`,
      stderr: ''
    })

    const result = await findTargetDisk(['/media', '/data'], '/other/path', 7)

    expect(result.path).toBe('/other/path')
  })

  it('selects the longest matching configured disk path', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/disk1s5   104857600  52428800  52428800  50% /`,
      stderr: ''
    })

    const result = await findTargetDisk(['/data', '/data/movies'], '/data/movies/Big.Buck.Bunny', 7)

    expect(result.path).toBe('/data/movies')
    expect(mockExec).toHaveBeenCalledWith('df -k "/data/movies"')
  })

  it('does not treat a similar path as a prefix match', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/disk1s5   104857600  52428800  52428800  50% /`,
      stderr: ''
    })

    const result = await findTargetDisk(['/data'], '/data2/movies', 7)

    expect(result.path).toBe('/data2/movies')
    expect(mockExec).toHaveBeenCalledWith('df -k "/data2/movies"')
  })

  it('normalizes trailing slashes before matching', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/disk1s5   104857600  52428800  52428800  50% /`,
      stderr: ''
    })

    const result = await findTargetDisk(['/media/'], '/media/Movies/', 7)

    expect(result.path).toBe('/media')
    expect(mockExec).toHaveBeenCalledWith('df -k "/media"')
  })

  it('treats / as matching every target path', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/disk1s5   104857600  52428800  52428800  50% /`,
      stderr: ''
    })

    const result = await findTargetDisk(['/', '/media'], '/data/movies', 7)

    expect(result.path).toBe('/')
    expect(mockExec).toHaveBeenCalledWith('df -k "/"')
  })

  it('checks only the target disk when other configured disks exist', async () => {
    mockExec.mockImplementation((command: string) => {
      if (command === 'df -k "/movies"') {
        return Promise.resolve({
          stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/movies    104857600  104857600          0 100% /movies`,
          stderr: ''
        })
      }
      if (command === 'df -k "/media"') {
        return Promise.resolve({
          stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/media      104857600   52428800   52428800  50% /media`,
          stderr: ''
        })
      }
      throw new Error(`unexpected disk check: ${command}`)
    })

    const result = await findTargetDisk(['/media', '/movies'], '/movies/Big.Buck.Bunny', 7, 5 * 1024 ** 3)

    expect(result.path).toBe('/movies')
    expect(result.hasEnoughSpace).toBe(false)
    expect(mockExec).toHaveBeenCalledTimes(1)
    expect(mockExec).toHaveBeenCalledWith('df -k "/movies"')
  })
})

describe('checkTargetDiskForDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubDiskSettings('true', '7')
  })

  it('returns null when the required size is unknown', async () => {
    const result = await checkTargetDiskForDownload(['/media'], '/media/Movies', 0)

    expect(result).toBeNull()
    expect(mockExec).not.toHaveBeenCalled()
  })

  it('returns null when no disks are configured', async () => {
    const result = await checkTargetDiskForDownload([], '/media/Movies', 100)

    expect(result).toBeNull()
    expect(mockExec).not.toHaveBeenCalled()
  })

  it('returns null when disk checking is disabled', async () => {
    stubDiskSettings('false', '7')
    const result = await checkTargetDiskForDownload(['/media'], '/media/Movies', 100)

    expect(result).toBeNull()
    expect(mockExec).not.toHaveBeenCalled()
  })

  it('returns the target disk status for a known required size', async () => {
    mockExec.mockResolvedValue({
      stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/media     104857600   92274688   12582912  88% /media`,
      stderr: ''
    })

    const result = await checkTargetDiskForDownload(['/media'], '/media/Movies', 5 * 1024 ** 3)

    expect(result?.minFreeGb).toBe(7)
    expect(result?.status.path).toBe('/media')
    expect(result?.status.hasEnoughSpace).toBe(true)
  })

  it('blocks when the target disk lacks space even though another configured disk has space', async () => {
    mockExec.mockImplementation((command: string) => {
      if (command === 'df -k "/movies"') {
        return Promise.resolve({
          stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/movies    104857600   99614720    5242880  95% /movies`,
          stderr: ''
        })
      }
      if (command === 'df -k "/media"') {
        return Promise.resolve({
          stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/media      104857600   52428800   52428800  50% /media`,
          stderr: ''
        })
      }
      throw new Error(`unexpected disk check: ${command}`)
    })

    const result = await checkTargetDiskForDownload(['/media', '/movies'], '/movies/Movies', 5 * 1024 ** 3)

    expect(result?.status.path).toBe('/movies')
    expect(result?.status.hasEnoughSpace).toBe(false)
    expect(mockExec).toHaveBeenCalledTimes(1)
    expect(mockExec).toHaveBeenCalledWith('df -k "/movies"')
  })

  it('allows when the target disk has space even though another configured disk is nearly full', async () => {
    mockExec.mockImplementation((command: string) => {
      if (command === 'df -k "/movies"') {
        return Promise.resolve({
          stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/movies    104857600   92274688   12582912  88% /movies`,
          stderr: ''
        })
      }
      if (command === 'df -k "/media"') {
        return Promise.resolve({
          stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/media      104857600  104332336     525264  99% /media`,
          stderr: ''
        })
      }
      throw new Error(`unexpected disk check: ${command}`)
    })

    const result = await checkTargetDiskForDownload(['/media', '/movies'], '/movies/Movies', 5 * 1024 ** 3)

    expect(result?.status.path).toBe('/movies')
    expect(result?.status.hasEnoughSpace).toBe(true)
    expect(mockExec).toHaveBeenCalledTimes(1)
    expect(mockExec).toHaveBeenCalledWith('df -k "/movies"')
  })
})
