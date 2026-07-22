import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let mockSelect: ReturnType<typeof vi.fn>
let mockInsert: ReturnType<typeof vi.fn>
let mockDelete: ReturnType<typeof vi.fn>

function setupDbMocks() {
  mockSelect = vi.fn()
  mockInsert = vi.fn()
  mockDelete = vi.fn()

  vi.stubGlobal(
    'useDb',
    vi.fn(() => ({
      select: mockSelect,
      insert: mockInsert,
      delete: mockDelete
    }))
  )
}

vi.stubGlobal(
  'useRuntimeConfig',
  vi.fn(() => ({}))
)
vi.stubGlobal(
  'getHeader',
  vi.fn(() => 'Mozilla/5.0 TestAgent')
)

vi.mock('#server/utils/settings', () => ({
  getSetting: vi.fn(),
  putSetting: vi.fn()
}))

vi.mock('#server/utils/ip', () => ({
  resolveIp: vi.fn(() => '192.168.1.1')
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() })
}))

vi.mock('#server/database/schema', () => ({
  loginAttempts: { ip: 'ip', success: 'success', createdAt: 'createdAt' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
  gt: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  count: vi.fn(() => 'cnt')
}))

import { getSetting, putSetting } from '#server/utils/settings'

describe('brute-force', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setupDbMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function loadBruteForce() {
    return await import('#server/utils/brute-force')
  }

  describe('getBruteForceConfig', () => {
    it('returns defaults when no setting saved', async () => {
      vi.mocked(getSetting).mockResolvedValue(undefined)
      const { getBruteForceConfig } = await loadBruteForce()
      const config = await getBruteForceConfig()
      expect(config).toEqual({
        maxAttemptsPerIp: 5,
        ipBlockDurationMinutes: 60,
        windowMinutes: 15
      })
    })

    it('merges saved config with defaults', async () => {
      vi.mocked(getSetting).mockResolvedValue(JSON.stringify({ maxAttemptsPerIp: 10 }))
      const { getBruteForceConfig } = await loadBruteForce()
      const config = await getBruteForceConfig()
      expect(config.maxAttemptsPerIp).toBe(10)
      expect(config.ipBlockDurationMinutes).toBe(60)
    })

    it('returns defaults on malformed JSON', async () => {
      vi.mocked(getSetting).mockResolvedValue('not-json')
      const { getBruteForceConfig } = await loadBruteForce()
      const config = await getBruteForceConfig()
      expect(config.maxAttemptsPerIp).toBe(5)
    })
  })

  describe('saveBruteForceConfig', () => {
    it('saves merged config to settings', async () => {
      vi.mocked(getSetting).mockResolvedValue(undefined)
      const { saveBruteForceConfig } = await loadBruteForce()
      await saveBruteForceConfig({ maxAttemptsPerIp: 3 })
      expect(putSetting).toHaveBeenCalledWith('brute_force_config', expect.stringContaining('"maxAttemptsPerIp":3'))
    })
  })

  describe('isIpBlocked', () => {
    it('returns false when no failed attempts', async () => {
      vi.mocked(getSetting).mockResolvedValue(undefined)
      const mockGet = vi.fn(() => ({ cnt: 0 }))
      mockSelect.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ get: mockGet }))
        }))
      })

      const { isIpBlocked } = await loadBruteForce()
      const result = await isIpBlocked('10.0.0.1')
      expect(result).toBe(false)
    })

    it('returns true when failed attempts exceed limit', async () => {
      vi.mocked(getSetting).mockResolvedValue(undefined)
      const mockGet = vi.fn(() => ({ cnt: 5 }))
      mockSelect.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ get: mockGet }))
        }))
      })

      const { isIpBlocked } = await loadBruteForce()
      const result = await isIpBlocked('10.0.0.2')
      expect(result).toBe(true)
    })

    it('returns true from cache on subsequent calls', async () => {
      vi.mocked(getSetting).mockResolvedValue(undefined)
      const mockGet = vi.fn(() => ({ cnt: 5 }))
      mockSelect.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ get: mockGet }))
        }))
      })

      const { isIpBlocked } = await loadBruteForce()
      await isIpBlocked('10.0.0.3')
      const result = await isIpBlocked('10.0.0.3')
      expect(result).toBe(true)
    })

    it('returns false after cache expires', async () => {
      vi.mocked(getSetting).mockResolvedValue(undefined)
      const mockGet = vi.fn(() => ({ cnt: 5 }))
      mockSelect.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ get: mockGet }))
        }))
      })

      const { isIpBlocked } = await loadBruteForce()
      await isIpBlocked('10.0.0.4')
      vi.advanceTimersByTime(61 * 60 * 1000)

      mockGet.mockReturnValue({ cnt: 0 })
      const result = await isIpBlocked('10.0.0.4')
      expect(result).toBe(false)
    })
  })

  describe('blockIp', () => {
    it('adds ip to cache and inserts record', async () => {
      vi.mocked(getSetting).mockResolvedValue(undefined)
      const mockRun = vi.fn()
      mockInsert.mockReturnValue({ values: vi.fn(() => ({ run: mockRun })) })

      const { blockIp } = await loadBruteForce()
      await blockIp('10.0.0.5', 'test reason')
      expect(mockInsert).toHaveBeenCalled()
      expect(mockRun).toHaveBeenCalled()
    })

    it('uses custom duration when provided', async () => {
      vi.mocked(getSetting).mockResolvedValue(undefined)
      const mockRun = vi.fn()
      mockInsert.mockReturnValue({ values: vi.fn(() => ({ run: mockRun })) })

      const { blockIp } = await loadBruteForce()
      await blockIp('10.0.0.6', 'test', 30)
      expect(mockInsert).toHaveBeenCalled()
    })
  })

  describe('unblockIp', () => {
    it('removes ip from cache and deletes records', async () => {
      const mockRun = vi.fn()
      mockDelete.mockReturnValue({ where: vi.fn(() => ({ run: mockRun })) })

      const { unblockIp } = await loadBruteForce()
      await unblockIp('10.0.0.7')
      expect(mockDelete).toHaveBeenCalled()
      expect(mockRun).toHaveBeenCalled()
    })
  })

  describe('getBlockedIps', () => {
    it('returns empty array when no blocked ips', async () => {
      vi.mocked(getSetting).mockResolvedValue(undefined)
      const { getBlockedIps } = await loadBruteForce()
      const result = await getBlockedIps()
      expect(result).toEqual([])
    })
  })

  describe('getBruteForceStats', () => {
    it('returns zeroed stats when no attempts', async () => {
      vi.mocked(getSetting).mockResolvedValue(undefined)
      const mockGet = vi.fn(() => ({ cnt: 0 }))
      mockSelect.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ get: mockGet }))
        }))
      })

      const { getBruteForceStats } = await loadBruteForce()
      const stats = await getBruteForceStats()
      expect(stats.blockedIpsCount).toBe(0)
      expect(stats.recentAttempts24h).toBe(0)
    })
  })

  describe('cleanupOldAttempts', () => {
    it('deletes old records from loginAttempts', async () => {
      const mockRun = vi.fn()
      mockDelete.mockReturnValue({ where: vi.fn(() => ({ run: mockRun })) })

      const { cleanupOldAttempts } = await loadBruteForce()
      await cleanupOldAttempts()
      expect(mockDelete).toHaveBeenCalled()
      expect(mockRun).toHaveBeenCalled()
    })
  })
})
