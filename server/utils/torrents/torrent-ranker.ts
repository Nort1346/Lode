import type { ProwlarrResult } from '#server/types/prowlarr'
import type { RankedTorrent, ParsedTitle, RankingConfig, ReleaseKind } from '#server/types/ranking'
import { DEFAULT_RANKING_CONFIG } from '#server/types/ranking'

function getConfig(overrides?: RankingConfig): RankingConfig {
  if (overrides !== undefined) return overrides
  return DEFAULT_RANKING_CONFIG
}

// Token-based release tag detection. Titles are split on the common release
// separators (". _ - : [ ] ( )" and whitespace), so "WEB.DL", "WEB-DL",
// "WEB DL" and "WEBDL" all resolve to the same tag, and short tags (ts, cam,
// tc, scr) only ever match whole tokens - never inside longer words like
// "DTS", "camera" or "webster".

const TOKEN_SPLIT = /[._:\-\s[\]()]+/

const YEAR_TOKEN = /^\d{4}$/

interface SourceMatch {
  // Scoring key looked up in config.sources
  key: string
  seq: string[]
}

interface SourceTagDef {
  tag: string
  matches: SourceMatch[]
  // Ambiguous tags (cam/ts/tc/scr) are only accepted when they appear after
  // the first year or resolution token and are not the trailing group token -
  // a leading "Cam" is a title word, not a capture tag.
  guarded?: boolean
}

interface TagDef {
  tag: string
  sequences: string[][]
  guarded?: boolean
}

interface ResolutionDef {
  key: string
  sequences: string[][]
}

// Priority order = display order = scoring winner (best source wins on
// conflict, e.g. a name containing both "BluRay" and "CAM" scores as BluRay;
// every detected source still shows up in the tag list)
const SOURCE_TAG_DEFS: SourceTagDef[] = [
  { tag: 'Remux', matches: [{ key: 'remux', seq: ['remux'] }, { key: 'remux', seq: ['bdremux'] }] },
  { tag: 'BluRay', matches: [{ key: 'bluray', seq: ['bluray'] }, { key: 'blu-ray', seq: ['blu', 'ray'] }] },
  { tag: 'BDRip', matches: [{ key: 'bdrip', seq: ['bdrip'] }] },
  { tag: 'BRRip', matches: [{ key: 'brrip', seq: ['brrip'] }] },
  { tag: 'WEB-DL', matches: [{ key: 'web-dl', seq: ['web', 'dl'] }, { key: 'webdl', seq: ['webdl'] }] },
  { tag: 'WEBRip', matches: [{ key: 'webrip', seq: ['webrip'] }, { key: 'webrip', seq: ['web', 'rip'] }] },
  { tag: 'WEB', matches: [{ key: 'web', seq: ['web'] }] },
  { tag: 'HDTV', matches: [{ key: 'hdtv', seq: ['hdtv'] }] },
  { tag: 'HDRip', matches: [{ key: 'hdrip', seq: ['hdrip'] }, { key: 'hdrip', seq: ['hd', 'rip'] }] },
  { tag: 'DVDRip', matches: [{ key: 'dvdrip', seq: ['dvdrip'] }, { key: 'dvdrip', seq: ['dvd', 'rip'] }] },
  // DVDScr is checked before DVD so the multi-token "dvd scr" form wins
  { tag: 'DVDScr', matches: [{ key: 'dvdscr', seq: ['dvdscr'] }, { key: 'dvdscr', seq: ['dvd', 'scr'] }] },
  { tag: 'DVD', matches: [{ key: 'dvd', seq: ['dvd'] }] },
  { tag: 'SCR', matches: [{ key: 'scr', seq: ['scr'] }, { key: 'scr', seq: ['screener'] }], guarded: true },
  { tag: 'TC', matches: [{ key: 'tc', seq: ['tc'] }, { key: 'tc', seq: ['telecine'] }], guarded: true },
  { tag: 'HDTS', matches: [{ key: 'hdts', seq: ['hdts'] }] },
  { tag: 'TS', matches: [{ key: 'ts', seq: ['ts'] }, { key: 'ts', seq: ['telesync'] }], guarded: true },
  { tag: 'CAM', matches: [{ key: 'cam', seq: ['cam'] }], guarded: true },
  { tag: 'HDCAM', matches: [{ key: 'hdcam', seq: ['hdcam'] }] }
]

const RESOLUTION_DEFS: ResolutionDef[] = [
  { key: '8k', sequences: [['8k']] },
  { key: '2160p', sequences: [['2160p'], ['uhd']] },
  { key: '4k', sequences: [['4k']] },
  { key: '1080p', sequences: [['1080p']] },
  { key: '720p', sequences: [['720p']] },
  { key: '576p', sequences: [['576p']] },
  { key: '480p', sequences: [['480p']] }
]

const VIDEO_TAG_DEFS: TagDef[] = [
  { tag: 'HDR10+', sequences: [['hdr10+'], ['hdr10plus']] },
  { tag: 'HDR10', sequences: [['hdr10']] },
  { tag: 'DV', sequences: [['dv'], ['dvhdr10'], ['dolby', 'vision']] },
  { tag: 'SDR', sequences: [['sdr']] },
  { tag: 'x264', sequences: [['x264'], ['h264'], ['avc']] },
  { tag: 'x265', sequences: [['x265'], ['h265'], ['hevc']] },
  { tag: 'AV1', sequences: [['av1']] },
  { tag: '10-bit', sequences: [['10bit'], ['10', 'bit']] },
  { tag: 'XviD', sequences: [['xvid']] }
]

const AUDIO_TAG_DEFS: TagDef[] = [
  { tag: 'DTS-HD', sequences: [['dts', 'hd']] },
  { tag: 'DTS:X', sequences: [['dts', 'x'], ['dtsex'], ['dtsx']] },
  { tag: 'DTS', sequences: [['dts']] },
  { tag: 'TrueHD', sequences: [['truehd'], ['true', 'hd']] },
  { tag: 'Atmos', sequences: [['atmos']] },
  { tag: 'DD+', sequences: [['dd+'], ['ddp'], ['ddp5'], ['dd5'], ['eac3'], ['dd']] },
  { tag: 'AAC', sequences: [['aac']] }
]

const OTHER_TAG_DEFS: TagDef[] = [
  { tag: 'Proper', sequences: [['proper']] },
  { tag: 'Repack', sequences: [['repack']] },
  { tag: '3D', sequences: [['3d']] },
  { tag: 'Multi', sequences: [['multi'], ['dual', 'audio'], ['multi', 'audio']] },
  { tag: 'LINE', sequences: [['line'], ['lnc']] },
  { tag: 'HC', sequences: [['hc'], ['hcs'], ['hardsub']], guarded: true }
]

export const SOURCE_TAGS: readonly string[] = SOURCE_TAG_DEFS.map((d) => d.tag)

export const CODEC_TAGS: readonly string[] = ['x264', 'x265', 'AV1', 'XviD']

function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .filter((t) => t.length > 0)
}

interface SeqMatch {
  index: number
  length: number
}

function findSequence(tokens: string[], seq: string[], valid?: (index: number) => boolean): number | null {
  for (let i = 0; i + seq.length <= tokens.length; i++) {
    if (valid !== undefined && !valid(i)) continue
    let matched = true
    for (let j = 0; j < seq.length; j++) {
      if (tokens[i + j] !== seq[j]) {
        matched = false
        break
      }
    }
    if (matched) return i
  }
  return null
}

function findFirstSequence(tokens: string[], sequences: string[][], valid?: (index: number) => boolean): SeqMatch | null {
  for (const seq of sequences) {
    const index = findSequence(tokens, seq, valid)
    if (index !== null) return { index, length: seq.length }
  }
  return null
}

function consume(consumed: Set<number>, match: SeqMatch): void {
  for (let j = 0; j < match.length; j++) {
    consumed.add(match.index + j)
  }
}

export function parseTorrentTitle(title: string, config?: RankingConfig): ParsedTitle {
  const cfg = getConfig(config)
  const tokens = tokenize(title)

  const yearIndex = tokens.findIndex((t) => YEAR_TOKEN.test(t) && Number(t) >= 1900 && Number(t) <= 2099)

  // The anchor is the later of the first year token and the first resolution
  // token: guarded source tags must come after both
  let resolutionKey: string | null = null
  let resolutionIndex = -1
  for (const def of RESOLUTION_DEFS) {
    const match = findFirstSequence(tokens, def.sequences)
    if (match === null) continue
    if (resolutionKey === null) resolutionKey = def.key
    if (resolutionIndex === -1 || match.index < resolutionIndex) resolutionIndex = match.index
  }
  const anchor = Math.max(yearIndex, resolutionIndex)

  const consumed = new Set<number>()
  const isFree = (index: number): boolean => !consumed.has(index)
  const guard = (index: number): boolean => index > anchor && index !== tokens.length - 1

  const tags: string[] = []

  let source: string | null = null
  for (const def of SOURCE_TAG_DEFS) {
    const valid = (i: number): boolean => (def.guarded === true ? guard(i) && isFree(i) : isFree(i))
    let match: SeqMatch | null = null
    let key: string | null = null
    for (const option of def.matches) {
      const m = findSequence(tokens, option.seq, valid)
      if (m !== null) {
        match = { index: m, length: option.seq.length }
        key = option.key
        break
      }
    }
    if (match === null || key === null) continue
    consume(consumed, match)
    tags.push(def.tag)
    if (source === null) source = key
  }

  for (const def of [...VIDEO_TAG_DEFS, ...AUDIO_TAG_DEFS, ...OTHER_TAG_DEFS]) {
    const valid = (i: number): boolean => (def.guarded === true ? guard(i) && isFree(i) : isFree(i))
    const match = findFirstSequence(tokens, def.sequences, valid)
    if (match !== null) {
      consume(consumed, match)
      tags.push(def.tag)
    }
  }

  // Admin-defined custom keys (added in the ranking admin page) keep working:
  // they are matched as whole token sequences when the fixed vocabulary did not
  if (source === null) {
    for (const key of Object.keys(cfg.sources)) {
      const seq = key.split('-').filter((p) => p !== '')
      const match = findFirstSequence(tokens, [seq], (i) => isFree(i))
      if (match !== null) {
        source = key
        break
      }
    }
  }
  if (resolutionKey === null) {
    for (const key of Object.keys(cfg.resolutions)) {
      const seq = key.split('-').filter((p) => p !== '')
      const match = findFirstSequence(tokens, [seq], (i) => isFree(i))
      if (match !== null) {
        resolutionKey = key
        break
      }
    }
  }

  let language: string | null = null
  for (const profile of cfg.languageProfiles) {
    if (profile.isFallback === true) continue
    for (const format of profile.formats) {
      for (const pattern of format.patterns) {
        try {
          if (new RegExp(pattern, 'i').test(title)) {
            language = `${profile.code}-${format.code}`
            break
          }
        } catch {
          // invalid regex pattern, skip
        }
      }
      if (language !== null) break
    }
    if (language !== null) break
  }

  let group: string | null = null
  const groupMatch = title.match(/[-.]\s*([A-Za-z0-9]+)\s*$/)
  if (groupMatch !== null && groupMatch[1] !== undefined) {
    group = groupMatch[1].toLowerCase()
  }

  return { resolution: resolutionKey, source, language, group, tags }
}

function scoreResolution(parsed: ParsedTitle, config: RankingConfig): number {
  if (parsed.resolution === null) return 0
  const rawScore = config.resolutions[parsed.resolution] ?? 0
  return (rawScore / DEFAULT_RANKING_CONFIG.weights.resolution) * config.weights.resolution
}

function scoreLanguage(parsed: ParsedTitle, config: RankingConfig): number {
  if (parsed.language !== null) {
    const dashIndex = parsed.language.indexOf('-')
    const profileCode = dashIndex !== -1 ? parsed.language.slice(0, dashIndex) : parsed.language
    const formatCode = dashIndex !== -1 ? parsed.language.slice(dashIndex + 1) : 'original'

    const profile = config.languageProfiles.find((p) => p.code === profileCode)
    if (profile !== undefined) {
      const format = profile.formats.find((f) => f.code === formatCode)
      if (format !== undefined) {
        return (format.score / DEFAULT_RANKING_CONFIG.weights.language) * config.weights.language
      }
    }
  }
  const fallback = config.languageProfiles.find((p) => p.isFallback === true)
  const fallbackScore = fallback?.formats[0]?.score ?? 0
  return (fallbackScore / DEFAULT_RANKING_CONFIG.weights.language) * config.weights.language
}

function scoreSeeders(seeders: number, config: RankingConfig): number {
  if (seeders <= 0) return 0
  const rawScore = Math.min(100, Math.round(11 * Math.log2(seeders + 1)))
  return (rawScore / DEFAULT_RANKING_CONFIG.weights.seeders) * config.weights.seeders
}

function scoreSizeFromThresholds(
  sizeBytes: number,
  thresholds: Array<{ min: number; max: number; score: number }>,
  weight: number
): number {
  const sizeGB = sizeBytes / (1024 * 1024 * 1024)
  for (const t of thresholds) {
    if (sizeGB >= t.min && sizeGB < t.max) {
      return (t.score / DEFAULT_RANKING_CONFIG.weights.size) * weight
    }
  }
  return 0
}

function scoreSize(sizeBytes: number, kind: ReleaseKind, config: RankingConfig): number {
  if (kind === 'seasonPack')
    return scoreSizeFromThresholds(sizeBytes, config.sizeThresholds.seasonPack, config.weights.size)
  if (kind === 'movie') return scoreSizeFromThresholds(sizeBytes, config.sizeThresholds.movie, config.weights.size)
  return scoreSizeFromThresholds(sizeBytes, config.sizeThresholds.series, config.weights.size)
}

function scoreSource(parsed: ParsedTitle, config: RankingConfig): number {
  if (parsed.source === null) return 0
  const rawScore = config.sources[parsed.source] ?? 0
  return (rawScore / DEFAULT_RANKING_CONFIG.weights.source) * config.weights.source
}

function scoreGroup(parsed: ParsedTitle, config: RankingConfig): number {
  if (parsed.group === null) return 0
  const rawScore = config.knownGroups.includes(parsed.group) ? 5 : 0
  return (rawScore / DEFAULT_RANKING_CONFIG.weights.group) * config.weights.group
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
  kind: ReleaseKind,
  mediaTitle: string,
  year: string,
  config: RankingConfig
): number {
  const parsed = parseTorrentTitle(result.title, config)

  const resolution = scoreResolution(parsed, config)
  const language = scoreLanguage(parsed, config)
  const seeders = scoreSeeders(result.seeders, config)
  const size = scoreSize(result.size, kind, config)
  const source = scoreSource(parsed, config)
  const group = scoreGroup(parsed, config)
  const titleRelevance = scoreTitleRelevance(result.title, mediaTitle, year, config)

  return resolution + language + seeders + size + source + group + titleRelevance
}

export function rankTorrents(
  results: ProwlarrResult[],
  kind: ReleaseKind = 'movie',
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
    const score = calculateScore(result, kind, mediaTitle, year, cfg)
    const percentage = scoreMax > 0 ? Math.min(100, Math.round((score / scoreMax) * 100)) : 0
    const parsed = parseTorrentTitle(result.title, cfg)
    return { ...result, score, percentage, recommended: false, parsed, isSeasonPack: kind === 'seasonPack' }
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
