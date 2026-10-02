import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetSetting = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

vi.mock('#server/types/settings', () => ({
  SETTINGS: { QBIT_SEEDING_ENABLED: 'qbit_seeding_enabled' }
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}))

import { isSeedingEnabled, applySeedingPolicy } from '#server/utils/torrents/seeding'

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
