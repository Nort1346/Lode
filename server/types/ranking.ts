import type { ProwlarrResult } from '#server/types/prowlarr'

export type { RankingConfig, RankingLanguage, RankingSizeThreshold } from '#shared/ranking'
export { DEFAULT_RANKING_CONFIG } from '#shared/ranking'

export interface ParsedTitle {
  resolution: string | null
  source: string | null
  language: string | null
  group: string | null
}

export interface RankedTorrent extends ProwlarrResult {
  score: number
  percentage: number
  recommended: boolean
  parsed: ParsedTitle
  isSeasonPack: boolean
}
