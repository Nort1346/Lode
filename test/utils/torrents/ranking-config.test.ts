import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetSetting = vi.hoisted(() => vi.fn())
const mockPutSetting = vi.hoisted(() => vi.fn())
const mockDeleteSetting = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting,
  putSetting: mockPutSetting,
  deleteSetting: mockDeleteSetting
}))

import {
  getRankingConfig,
  saveRankingConfig,
  resetRankingConfig,
  migrateLanguagesToProfiles
} from '#server/utils/torrents/ranking-config'
import { RANKING_SIZE_UNLIMITED, DEFAULT_RANKING_CONFIG } from '#shared/ranking'

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

    it('hydrates legacy sentinels (-1 → JSON-safe cap)', async () => {
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
      expect(config.sizeThresholds!.movie[0]!.max).toBe(RANKING_SIZE_UNLIMITED)
      expect(config.sizeThresholds!.series[0]!.max).toBe(RANKING_SIZE_UNLIMITED)
      expect(config.sizeThresholds!.seasonPack[0]!.max).toBe(RANKING_SIZE_UNLIMITED)
    })

    it('returns defaults when JSON is invalid', async () => {
      mockGetSetting.mockReturnValue('invalid-json')
      const config = await getRankingConfig()
      expect(config.recommendedCount).toBe(3)
    })
  })

  describe('saveRankingConfig', () => {
    it('stores the JSON-safe size cap as-is', async () => {
      const config = {
        weights: { resolution: 40, language: 30, seeders: 100, size: 20, source: 10, group: 5 },
        resolutions: { '1080p': 40 },
        sources: { remux: 10 },
        languageProfiles: DEFAULT_RANKING_CONFIG.languageProfiles,
        knownGroups: [],
        sizeThresholds: {
          movie: [{ min: 0, max: RANKING_SIZE_UNLIMITED, score: 10 }],
          series: [{ min: 0, max: RANKING_SIZE_UNLIMITED, score: 10 }],
          seasonPack: [{ min: 0, max: RANKING_SIZE_UNLIMITED, score: 10 }]
        },
        titleRelevance: { wordWeight: 15, yearWeight: 10, fullTitleWeight: 10, penalty: -20 },
        recommendedCount: 3
      }
      await saveRankingConfig(config)
      expect(mockPutSetting).toHaveBeenCalled()
      const stored = JSON.parse(mockPutSetting.mock.calls[0]![1] as string)
      expect(stored.sizeThresholds.movie[0].max).toBe(RANKING_SIZE_UNLIMITED)
    })
  })

  describe('resetRankingConfig', () => {
    it('deletes the ranking config setting', async () => {
      await resetRankingConfig()
      expect(mockDeleteSetting).toHaveBeenCalled()
    })
  })

  describe('migrateLanguagesToProfiles', () => {
    it('groups old flat languages by prefix', () => {
      const oldLanguages = [
        { code: 'pl-dub', score: 30, patterns: ['pldub'], isFallback: false },
        { code: 'pl-lektor', score: 25, patterns: ['lektor'], isFallback: false },
        { code: 'de-dub', score: 30, patterns: ['german'], isFallback: false },
        { code: 'other', score: 10, patterns: ['other'], isFallback: true }
      ]
      const profiles = migrateLanguagesToProfiles(oldLanguages)
      expect(profiles).toHaveLength(3)

      const pl = profiles.find((p) => p.code === 'pl')
      expect(pl).toBeDefined()
      expect(pl!.formats).toHaveLength(2)
      expect(pl!.formats[0]!.code).toBe('dub')
      expect(pl!.formats[0]!.score).toBe(30)
      expect(pl!.formats[1]!.code).toBe('lektor')
      expect(pl!.formats[1]!.score).toBe(25)

      const de = profiles.find((p) => p.code === 'de')
      expect(de).toBeDefined()
      expect(de!.formats).toHaveLength(1)
      expect(de!.formats[0]!.code).toBe('dub')

      const fallback = profiles.find((p) => p.isFallback)
      expect(fallback).toBeDefined()
      expect(fallback!.formats[0]!.code).toBe('original')
    })

    it('handles language code without dash as original format', () => {
      const oldLanguages = [{ code: 'fr', score: 30, patterns: ['francese'], isFallback: false }]
      const profiles = migrateLanguagesToProfiles(oldLanguages)
      expect(profiles).toHaveLength(1)
      expect(profiles[0]!.code).toBe('fr')
      expect(profiles[0]!.formats[0]!.code).toBe('original')
    })

    it('preserves patterns and scores', () => {
      const oldLanguages = [{ code: 'pl-dub', score: 35, patterns: ['pldub', 'pl dubbing'], isFallback: false }]
      const profiles = migrateLanguagesToProfiles(oldLanguages)
      expect(profiles[0]!.formats[0]!.score).toBe(35)
      expect(profiles[0]!.formats[0]!.patterns).toEqual(['pldub', 'pl dubbing'])
    })
  })

  describe('getRankingConfig migration', () => {
    it('migrates old languages format to languageProfiles', async () => {
      mockGetSetting.mockReturnValue(
        JSON.stringify({
          languages: [
            { code: 'pl-dub', score: 30, patterns: ['pldub'], isFallback: false },
            { code: 'pl-lektor', score: 25, patterns: ['lektor'], isFallback: false },
            { code: 'other', score: 10, patterns: [], isFallback: true }
          ]
        })
      )
      const config = await getRankingConfig()
      expect(config.languageProfiles).toHaveLength(2)
      const pl = config.languageProfiles.find((p) => p.code === 'pl')
      expect(pl).toBeDefined()
      expect(pl!.formats).toHaveLength(2)
      const fallback = config.languageProfiles.find((p) => p.isFallback)
      expect(fallback).toBeDefined()
    })

    it('uses languageProfiles if already in new format', async () => {
      mockGetSetting.mockReturnValue(
        JSON.stringify({
          languageProfiles: [
            { code: 'en', label: 'English', formats: [{ code: 'dub', label: 'Dubbing', score: 30, patterns: [] }] }
          ]
        })
      )
      const config = await getRankingConfig()
      expect(config.languageProfiles).toHaveLength(1)
      expect(config.languageProfiles[0]!.code).toBe('en')
    })
  })
})
