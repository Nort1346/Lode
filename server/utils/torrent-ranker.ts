import type { ProwlarrResult } from '#server/types/prowlarr'
import type { RankedTorrent, ParsedTitle, RankingConfig } from '#server/types/ranking'
import { DEFAULT_RANKING_CONFIG } from '#server/types/ranking'

function getConfig(overrides?: RankingConfig): RankingConfig {
  if (overrides !== undefined) return overrides
  return DEFAULT_RANKING_CONFIG
}

export function parseTorrentTitle(title: string, config?: RankingConfig): ParsedTitle {
  const cfg = getConfig(config)
  const lower = title.toLowerCase()

  let resolution: string | null = null
  for (const key of Object.keys(cfg.resolutions)) {
    if (lower.includes(key)) {
      resolution = key
      break
    }
  }

  let source: string | null = null
  for (const key of Object.keys(cfg.sources)) {
    if (lower.includes(key)) {
      source = key
      break
    }
  }

  let language: string | null = null
  for (const lang of cfg.languages) {
    if (lang.isFallback === true) continue
    for (const pattern of lang.patterns) {
      try {
        if (new RegExp(pattern, 'i').test(title)) {
          language = lang.code
          break
        }
      } catch {
        // invalid regex pattern, skip
      }
    }
    if (language !== null) break
  }

  let group: string | null = null
  const groupMatch = title.match(/[-.]\s*([A-Za-z0-9]+)\s*$/)
  if (groupMatch !== null && groupMatch[1] !== undefined) {
    group = groupMatch[1].toLowerCase()
  }

  return { resolution, source, language, group }
}

function detectSeasonPack(title: string): boolean {
  const lower = title.toLowerCase()
  if (/s\d{2}(?!e\d)/.test(lower)) return true
  if (/season\s+\d+/.test(lower)) return true
  if (/sezon\s+\d+/.test(lower)) return true
  return false
}

function scoreResolution(parsed: ParsedTitle, config: RankingConfig): number {
  if (parsed.resolution === null) return 5
  return config.resolutions[parsed.resolution] ?? 5
}

function scoreLanguage(parsed: ParsedTitle, config: RankingConfig): number {
  if (parsed.language !== null) {
    const lang = config.languages.find((l) => l.code === parsed.language)
    if (lang !== undefined) return lang.score
  }
  const fallback = config.languages.find((l) => l.isFallback === true)
  return fallback?.score ?? 8
}

function scoreSeeders(seeders: number): number {
  if (seeders <= 0) return 0
  return Math.min(100, Math.round(11 * Math.log2(seeders + 1)))
}

function scoreSizeFromThresholds(
  sizeBytes: number,
  thresholds: Array<{ min: number; max: number; score: number }>
): number {
  const sizeGB = sizeBytes / (1024 * 1024 * 1024)
  for (const t of thresholds) {
    if (sizeGB >= t.min && sizeGB < t.max) return t.score
  }
  return 3
}

function scoreSize(sizeBytes: number, type: 'movie' | 'series', isSeasonPack: boolean, config: RankingConfig): number {
  if (type === 'movie') return scoreSizeFromThresholds(sizeBytes, config.sizeThresholds.movie)
  if (isSeasonPack) return scoreSizeFromThresholds(sizeBytes, config.sizeThresholds.seasonPack)
  return scoreSizeFromThresholds(sizeBytes, config.sizeThresholds.series)
}

function scoreSource(parsed: ParsedTitle, config: RankingConfig): number {
  if (parsed.source === null) return 3
  return config.sources[parsed.source] ?? 3
}

function scoreGroup(parsed: ParsedTitle, config: RankingConfig): number {
  if (parsed.group === null) return 0
  return config.knownGroups.includes(parsed.group) ? 5 : 0
}

function scoreTitleRelevance(torrentTitle: string, mediaTitle: string, year: string, config: RankingConfig): number {
  if (mediaTitle.length === 0) return 0

  const lower = torrentTitle.toLowerCase()
  const titleLower = mediaTitle.toLowerCase()

  const words = titleLower.split(/\s+/).filter((w) => w.length >= 3)
  if (words.length === 0) return 0

  const matchedWords = words.filter((w) => lower.includes(w))
  if (matchedWords.length === 0) return config.titleRelevance.penalty

  const wordScore = Math.round((matchedWords.length / words.length) * config.titleRelevance.wordWeight)
  const yearScore = year !== '' && lower.includes(year) ? config.titleRelevance.yearWeight : 0
  const fullTitleScore = lower.includes(titleLower) ? config.titleRelevance.fullTitleWeight : 0

  return wordScore + yearScore + fullTitleScore
}

function calculateScore(
  result: ProwlarrResult,
  type: 'movie' | 'series',
  mediaTitle: string,
  year: string,
  config: RankingConfig
): number {
  const parsed = parseTorrentTitle(result.title, config)
  const isSeasonPack = type === 'series' && detectSeasonPack(result.title)

  const resolution = scoreResolution(parsed, config)
  const language = scoreLanguage(parsed, config)
  const seeders = scoreSeeders(result.seeders)
  const size = scoreSize(result.size, type, isSeasonPack, config)
  const source = scoreSource(parsed, config)
  const group = scoreGroup(parsed, config)
  const titleRelevance = scoreTitleRelevance(result.title, mediaTitle, year, config)

  return resolution + language + seeders + size + source + group + titleRelevance
}

export function rankTorrents(
  results: ProwlarrResult[],
  type: 'movie' | 'series' = 'movie',
  mediaTitle = '',
  year = '',
  config?: RankingConfig
): RankedTorrent[] {
  const cfg = getConfig(config)
  const scoreMax =
    cfg.weights.resolution +
    cfg.weights.language +
    cfg.weights.seeders +
    cfg.weights.size +
    cfg.weights.source +
    cfg.weights.group +
    cfg.titleRelevance.wordWeight +
    cfg.titleRelevance.yearWeight +
    cfg.titleRelevance.fullTitleWeight

  const ranked = results.map((result) => {
    const score = calculateScore(result, type, mediaTitle, year, cfg)
    const percentage = scoreMax > 0 ? Math.min(100, Math.round((score / scoreMax) * 100)) : 0
    const parsed = parseTorrentTitle(result.title, cfg)
    const isSeasonPack = type === 'series' && detectSeasonPack(result.title)
    return { ...result, score, percentage, recommended: false, parsed, isSeasonPack }
  })

  ranked.sort((a, b) => b.score - a.score)

  const topCount = Math.min(cfg.recommendedCount, ranked.length)
  for (let i = 0; i < topCount; i++) {
    const item = ranked[i]
    if (item !== undefined) {
      item.recommended = true
    }
  }

  return ranked
}

export function formatScore(score: number, config?: RankingConfig): string {
  const cfg = getConfig(config)
  const scoreMax =
    cfg.weights.resolution +
    cfg.weights.language +
    cfg.weights.seeders +
    cfg.weights.size +
    cfg.weights.source +
    cfg.weights.group +
    cfg.titleRelevance.wordWeight +
    cfg.titleRelevance.yearWeight +
    cfg.titleRelevance.fullTitleWeight
  const pct = scoreMax > 0 ? Math.min(100, Math.round((score / scoreMax) * 100)) : 0
  return `${pct}%`
}
