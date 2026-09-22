import type { ProwlarrResult } from '#server/types/prowlarr'

export type {
  RankingConfig,
  RankingLanguage,
  RankingLanguageProfile,
  RankingFormat,
  RankingSizeThreshold
} from '#shared/ranking'
export { DEFAULT_RANKING_CONFIG } from '#shared/ranking'

// Which size threshold table and context a ranked release is scored with.
// 'seasonPack' is supplied by the caller (the season endpoint classifies
// which bucket a release landed in) - the ranker never guesses it from the
// title itself.
export type ReleaseKind = 'movie' | 'series' | 'seasonPack'

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
