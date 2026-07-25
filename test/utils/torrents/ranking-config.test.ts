import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetSetting = vi.hoisted(() => vi.fn())
const mockPutSetting = vi.hoisted(() => vi.fn())
const mockDeleteSetting = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting,
  putSetting: mockPutSetting,
  deleteSetting: mockDeleteSetting
}))

import { getRankingConfig, saveRankingConfig, resetRankingConfig } from '#server/utils/torrents/ranking-config'

describe('ranking-config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getRankingConfig', () => {
    it('returns default config when no setting stored', async () => {
      mockGetSetting.mockReturnValue(undefined)
      const config = await getRankingConfig()
      expect(config.weights.resolution).toBe(40)
      expect(config.recommendedCount).toBe(3)
    })

    it('parses stored JSON and merges with defaults', async () => {
      mockGetSetting.mockReturnValue(JSON.stringify({ recommendedCount: 5 }))
      const config = await getRankingConfig()
      expect(config.recommendedCount).toBe(5)
      expect(config.weights.resolution).toBe(40)
    })

    it('hydrates Infinity sentinels (-1 → Infinity)', async () => {
      mockGetSetting.mockReturnValue(
        JSON.stringify({
          sizeThresholds: {
            movie: [{ min: 0, max: -1, score: 10 }],
            series: [{ min: 0, max: -1, score: 10 }],
            seasonPack: [{ min: 0, max: -1, score: 10 }]
          }
        })
      )
      const config = await getRankingConfig()
      expect(config.sizeThresholds!.movie[0]!.max).toBe(Infinity)
      expect(config.sizeThresholds!.series[0]!.max).toBe(Infinity)
      expect(config.sizeThresholds!.seasonPack[0]!.max).toBe(Infinity)
    })

    it('returns defaults when JSON is invalid', async () => {
      mockGetSetting.mockReturnValue('invalid-json')
      const config = await getRankingConfig()
      expect(config.recommendedCount).toBe(3)
    })
  })

  describe('saveRankingConfig', () => {
    it('dehydrates Infinity sentinels and stores JSON', async () => {
      const config = {
        weights: { resolution: 40, language: 30, seeders: 100, size: 20, source: 10, group: 5 },
        resolutions: { '1080p': 40 },
        sources: { remux: 10 },
        languages: [],
        knownGroups: [],
        sizeThresholds: {
          movie: [{ min: 0, max: Infinity, score: 10 }],
          series: [{ min: 0, max: Infinity, score: 10 }],
          seasonPack: [{ min: 0, max: Infinity, score: 10 }]
        },
        titleRelevance: { wordWeight: 15, yearWeight: 10, fullTitleWeight: 10, penalty: -20 },
        recommendedCount: 3
      }
      await saveRankingConfig(config)
      expect(mockPutSetting).toHaveBeenCalled()
      const stored = JSON.parse(mockPutSetting.mock.calls[0]![1] as string)
      expect(stored.sizeThresholds.movie[0].max).toBe(-1)
    })
  })

  describe('resetRankingConfig', () => {
    it('deletes the ranking config setting', async () => {
      await resetRankingConfig()
      expect(mockDeleteSetting).toHaveBeenCalled()
    })
  })
})
