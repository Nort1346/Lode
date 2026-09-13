import type {
  RankingConfig,
  RankingSizeThreshold,
  RankingLanguage,
  RankingLanguageProfile
} from '#server/types/ranking'
import { DEFAULT_RANKING_CONFIG, RANKING_SIZE_UNLIMITED } from '#shared/ranking'
import { SETTINGS } from '#server/types/settings'
import { getSetting, putSetting, deleteSetting } from '#server/utils/settings'

// Legacy rows may still store -1 as the "unlimited" sentinel from before the JSON-safe cap
const LEGACY_INFINITY_SENTINEL = -1

function hydrateThresholds(thresholds: RankingSizeThreshold[]): RankingSizeThreshold[] {
  return thresholds.map((t) => ({
    ...t,
    max: t.max === LEGACY_INFINITY_SENTINEL ? RANKING_SIZE_UNLIMITED : t.max
  }))
}

// Convert old flat languages array to new nested languageProfiles
export function migrateLanguagesToProfiles(languages: RankingLanguage[]): RankingLanguageProfile[] {
  const profiles = new Map<string, RankingLanguageProfile>()

  for (const lang of languages) {
    if (lang.isFallback === true) {
      let profile = profiles.get(lang.code)
      if (profile === undefined) {
        profile = {
          code: lang.code,
          label: lang.code,
          formats: [],
          isFallback: true
        }
        profiles.set(lang.code, profile)
      }
      profile.formats.push({
        code: 'original',
        label: 'Original',
        score: lang.score,
        patterns: lang.patterns
      })
    } else {
      const dashIndex = lang.code.indexOf('-')
      let prefix: string
      let suffix: string
      if (dashIndex !== -1) {
        prefix = lang.code.slice(0, dashIndex)
        suffix = lang.code.slice(dashIndex + 1)
      } else {
        prefix = lang.code
        suffix = 'original'
      }
      let profile = profiles.get(prefix)
      if (profile === undefined) {
        profile = {
          code: prefix,
          label: prefix,
          formats: []
        }
        profiles.set(prefix, profile)
      }
      profile.formats.push({
        code: suffix,
        label: suffix,
        score: lang.score,
        patterns: lang.patterns
      })
    }
  }

  return Array.from(profiles.values())
}

// Stored config may be in the old format (languages) or new format (languageProfiles)
type StoredConfig = Partial<RankingConfig> & {
  languages?: RankingLanguage[]
}

export async function getRankingConfig(): Promise<RankingConfig> {
  const value = await getSetting(SETTINGS.RANKING_CONFIG)

  if (value === undefined) return structuredClone(DEFAULT_RANKING_CONFIG)

  try {
    const parsed = JSON.parse(value) as StoredConfig

    let languageProfiles: RankingLanguageProfile[]
    if (parsed.languageProfiles !== undefined) {
      languageProfiles = parsed.languageProfiles
    } else if (parsed.languages !== undefined) {
      languageProfiles = migrateLanguagesToProfiles(parsed.languages)
    } else {
      languageProfiles = structuredClone(DEFAULT_RANKING_CONFIG.languageProfiles)
    }

    const movie = parsed.sizeThresholds?.movie ?? DEFAULT_RANKING_CONFIG.sizeThresholds.movie
    const series = parsed.sizeThresholds?.series ?? DEFAULT_RANKING_CONFIG.sizeThresholds.series
    const seasonPack = parsed.sizeThresholds?.seasonPack ?? DEFAULT_RANKING_CONFIG.sizeThresholds.seasonPack

    return {
      weights: { ...DEFAULT_RANKING_CONFIG.weights, ...parsed.weights },
      resolutions: parsed.resolutions ?? DEFAULT_RANKING_CONFIG.resolutions,
      sources: parsed.sources ?? DEFAULT_RANKING_CONFIG.sources,
      languageProfiles,
      knownGroups: parsed.knownGroups ?? DEFAULT_RANKING_CONFIG.knownGroups,
      sizeThresholds: {
        movie: hydrateThresholds(movie),
        series: hydrateThresholds(series),
        seasonPack: hydrateThresholds(seasonPack)
      },
      titleRelevance: { ...DEFAULT_RANKING_CONFIG.titleRelevance, ...parsed.titleRelevance },
      recommendedCount: parsed.recommendedCount ?? DEFAULT_RANKING_CONFIG.recommendedCount
    }
  } catch {
    return structuredClone(DEFAULT_RANKING_CONFIG)
  }
}

export async function saveRankingConfig(config: RankingConfig): Promise<void> {
  // The size cap is a plain number, so the config serializes to JSON as-is
  await putSetting(SETTINGS.RANKING_CONFIG, JSON.stringify(config))
}

export async function resetRankingConfig(): Promise<void> {
  await deleteSetting(SETTINGS.RANKING_CONFIG)
}
