import type { RankingConfig, RankingSizeThreshold } from '#server/types/ranking'
import { DEFAULT_RANKING_CONFIG } from '#server/types/ranking'
import { SETTINGS } from '#server/types/settings'
import { getSetting, putSetting, deleteSetting } from '#server/utils/settings'

const INFINITY_SENTINEL = -1

function hydrateThresholds(thresholds: RankingSizeThreshold[]): RankingSizeThreshold[] {
  return thresholds.map((t) => ({
    ...t,
    max: t.max === INFINITY_SENTINEL ? Infinity : t.max
  }))
}

function dehydrateThresholds(thresholds: RankingSizeThreshold[]): RankingSizeThreshold[] {
  return thresholds.map((t) => ({
    ...t,
    max: t.max === Infinity ? INFINITY_SENTINEL : t.max
  }))
}

export async function getRankingConfig(): Promise<RankingConfig> {
  const value = await getSetting(SETTINGS.RANKING_CONFIG)

  if (value === undefined) return { ...DEFAULT_RANKING_CONFIG }

  try {
    const parsed = JSON.parse(value) as Partial<RankingConfig>
    const movie = parsed.sizeThresholds?.movie ?? DEFAULT_RANKING_CONFIG.sizeThresholds.movie
    const series = parsed.sizeThresholds?.series ?? DEFAULT_RANKING_CONFIG.sizeThresholds.series
    const seasonPack = parsed.sizeThresholds?.seasonPack ?? DEFAULT_RANKING_CONFIG.sizeThresholds.seasonPack
    return {
      ...DEFAULT_RANKING_CONFIG,
      ...parsed,
      weights: { ...DEFAULT_RANKING_CONFIG.weights, ...parsed.weights },
      titleRelevance: { ...DEFAULT_RANKING_CONFIG.titleRelevance, ...parsed.titleRelevance },
      sizeThresholds: {
        movie: hydrateThresholds(movie),
        series: hydrateThresholds(series),
        seasonPack: hydrateThresholds(seasonPack)
      }
    }
  } catch {
    return { ...DEFAULT_RANKING_CONFIG }
  }
}

export async function saveRankingConfig(config: RankingConfig): Promise<void> {
  const toStore: RankingConfig = {
    ...config,
    sizeThresholds: {
      movie: dehydrateThresholds(config.sizeThresholds.movie),
      series: dehydrateThresholds(config.sizeThresholds.series),
      seasonPack: dehydrateThresholds(config.sizeThresholds.seasonPack)
    }
  }

  await putSetting(SETTINGS.RANKING_CONFIG, JSON.stringify(toStore))
}

export async function resetRankingConfig(): Promise<void> {
  await deleteSetting(SETTINGS.RANKING_CONFIG)
}
