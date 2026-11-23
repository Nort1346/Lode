import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetSetting = vi.hoisted(() => vi.fn())
const mockHashRows = vi.hoisted(() => vi.fn((): Array<{ torrentHash: string | null }> => []))
const mockGetAllTorrents = vi.hoisted(() => vi.fn())
const mockSetShareLimits = vi.hoisted(() => vi.fn())

// test/setup.ts maps useDbAsync onto the global useDb; stub it so the real
// dbAll helper receives our rows.
vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ all: () => mockHashRows() })) })) }))
  }))
)
vi.stubGlobal(
  'useQBittorrent',
  vi.fn(() => ({ getAllTorrents: mockGetAllTorrents, setShareLimits: mockSetShareLimits }))
)

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

vi.mock('#server/types/settings', () => ({
  SETTINGS: { QBIT_SEEDING_ENABLED: 'qbit_seeding_enabled' }
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}))

import { isSeedingEnabled, applySeedingPolicy, disableSeedingForTrackedTorrents } from '#server/utils/torrents/seeding'

describe('isSeedingEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to true for existing installs (unset)', async () => {
    mockGetSetting.mockResolvedValue(undefined)

    await expect(isSeedingEnabled()).resolves.toBe(true)
    expect(mockGetSetting).toHaveBeenCalledWith('qbit_seeding_enabled')
  })

  it('returns true when explicitly enabled', async () => {
    mockGetSetting.mockResolvedValue('true')

    await expect(isSeedingEnabled()).resolves.toBe(true)
  })

  it('returns false when disabled', async () => {
    mockGetSetting.mockResolvedValue('false')

    await expect(isSeedingEnabled()).resolves.toBe(false)
  })
})

describe('applySeedingPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when seeding is enabled', async () => {
    mockGetSetting.mockResolvedValue('true')
    const qbit = { setShareLimits: vi.fn() }

    await applySeedingPolicy(qbit, 'abc123')

    expect(qbit.setShareLimits).not.toHaveBeenCalled()
  })

  it('does nothing when the setting is unset (default enabled)', async () => {
    mockGetSetting.mockResolvedValue(undefined)
    const qbit = { setShareLimits: vi.fn() }

    await applySeedingPolicy(qbit, 'abc123')

    expect(qbit.setShareLimits).not.toHaveBeenCalled()
  })

  it('sends ratioLimit=0 and seedingTimeLimit=0 when disabled', async () => {
    mockGetSetting.mockResolvedValue('false')
    const qbit = { setShareLimits: vi.fn().mockResolvedValue(undefined) }

    await applySeedingPolicy(qbit, 'abc123')

    expect(qbit.setShareLimits).toHaveBeenCalledWith('abc123', 0, 0, 0)
  })

  it('swallows qBittorrent failures so the download itself is not failed', async () => {
    mockGetSetting.mockResolvedValue('false')
    const qbit = { setShareLimits: vi.fn().mockRejectedValue(new Error('qBittorrent API error 500: boom')) }

    await expect(applySeedingPolicy(qbit, 'abc123')).resolves.toBeUndefined()
    expect(qbit.setShareLimits).toHaveBeenCalledWith('abc123', 0, 0, 0)
  })
})

describe('disableSeedingForTrackedTorrents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHashRows.mockReturnValue([])
    mockGetAllTorrents.mockReset()
    mockGetAllTorrents.mockResolvedValue([])
    mockSetShareLimits.mockReset()
    mockSetShareLimits.mockResolvedValue(undefined)
  })

  it('does nothing when seeding is enabled', async () => {
    mockGetSetting.mockResolvedValue('true')
    mockHashRows.mockReturnValue([{ torrentHash: 'h1' }])

    await expect(disableSeedingForTrackedTorrents()).resolves.toBe(0)

    expect(mockGetAllTorrents).not.toHaveBeenCalled()
    expect(mockSetShareLimits).not.toHaveBeenCalled()
  })

  it('applies the zero share limits to all still-present tracked torrents', async () => {
    mockGetSetting.mockResolvedValue('false')
    mockHashRows.mockReturnValue([
      { torrentHash: 'h1' },
      { torrentHash: 'h2' },
      { torrentHash: 'h1' },
      { torrentHash: null },
      { torrentHash: '' }
    ])
    mockGetAllTorrents.mockResolvedValue([{ hash: 'h1' }, { hash: 'h2' }, { hash: 'gone' }])

    await expect(disableSeedingForTrackedTorrents()).resolves.toBe(2)

    expect(mockSetShareLimits).toHaveBeenCalledTimes(1)
    expect(mockSetShareLimits).toHaveBeenCalledWith('h1|h2', 0, 0, 0)
  })

  it('batches large torrent lists', async () => {
    mockGetSetting.mockResolvedValue('false')
    const hashes = Array.from({ length: 51 }, (_, i) => `h${i}`)
    mockHashRows.mockReturnValue(hashes.map((hash) => ({ torrentHash: hash })))
    mockGetAllTorrents.mockResolvedValue(hashes.map((hash) => ({ hash })))

    await expect(disableSeedingForTrackedTorrents()).resolves.toBe(51)

    expect(mockSetShareLimits).toHaveBeenCalledTimes(2)
    expect(mockSetShareLimits.mock.calls[1]?.[0].split('|')).toHaveLength(1)
  })

  it('keeps applying the remaining batches when one fails', async () => {
    mockGetSetting.mockResolvedValue('false')
    const hashes = Array.from({ length: 51 }, (_, i) => `h${i}`)
    mockHashRows.mockReturnValue(hashes.map((hash) => ({ torrentHash: hash })))
    mockGetAllTorrents.mockResolvedValue(hashes.map((hash) => ({ hash })))
    mockSetShareLimits.mockRejectedValueOnce(new Error('qBittorrent API error 500: boom'))

    await expect(disableSeedingForTrackedTorrents()).resolves.toBe(1)

    expect(mockSetShareLimits).toHaveBeenCalledTimes(2)
  })

  it('swallows qBittorrent outages', async () => {
    mockGetSetting.mockResolvedValue('false')
    mockHashRows.mockReturnValue([{ torrentHash: 'h1' }])
    mockGetAllTorrents.mockRejectedValue(new Error('qBittorrent offline'))

    await expect(disableSeedingForTrackedTorrents()).resolves.toBe(0)

    expect(mockSetShareLimits).not.toHaveBeenCalled()
  })
})
