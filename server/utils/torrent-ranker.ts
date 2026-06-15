import type { ProwlarrResult } from './prowlarr'

export interface RankedTorrent extends ProwlarrResult {
  score: number
  recommended: boolean
  parsed: ParsedTitle
}

export interface ParsedTitle {
  resolution: string | null
  source: string | null
  language: string | null
  group: string | null
}

const RESOLUTION_MAP: Record<string, number> = {
  '2160p': 15,
  '4k': 15,
  '1080p': 30,
  '720p': 15,
  '480p': 5,
  '576p': 5
}

const SOURCE_MAP: Record<string, number> = {
  remux: 10,
  'blu-ray': 9,
  bluray: 9,
  bdrip: 8,
  'web-dl': 8,
  webdl: 8,
  webrip: 7,
  web: 7,
  hdrip: 6,
  hdtv: 5,
  dvdrip: 4,
  dvd: 4,
  hdtvrip: 4,
  cam: 1,
  ts: 1,
  tc: 1
}

const POLISH_DUB_PATTERNS = [/pldub/i, /pl[\s.]?dub/i, /polish[\s.]?dub/i, /dubbing[\s.]?pl/i, /pl[\s-]?audio/i]

const POLISH_SUB_PATTERNS = [
  /plsub/i,
  /pl[\s.]?sub/i,
  /polish[\s.]?sub/i,
  /napisy[\s.]?pl/i,
  /pl[\s.]?napi/i,
  /napisypl/i,
  /sub[\s.]?pl/i
]

const POLISH_LEKTOR_PATTERNS = [/lektor[\s.]?pl/i, /pl[\s.]?lek/i, /lektor/i]

const ENGLISH_PATTERNS = [/\beng(?:lish)?[\s.]?(?:sub|dub)?/i, /\ben[\s.]?(?:sub|dub)/i]

const KNOWN_GROUPS = new Set([
  'yify',
  'yts',
  'evo',
  'axxo',
  'rarbg',
  'psa',
  'cmrg',
  'galaxyrg',
  'fgt',
  'ettv',
  'scene',
  'amiable',
  'blurayclub',
  'hdaccess',
  'frds',
  'directors',
  'diimensional',
  'hifi',
  'novarug',
  'sparks',
  'hdk',
  'rifftrax',
  'quicksub',
  'subfactory'
])

export function parseTorrentTitle(title: string): ParsedTitle {
  const lower = title.toLowerCase()

  let resolution: string | null = null
  for (const [key] of Object.entries(RESOLUTION_MAP)) {
    if (lower.includes(key)) {
      resolution = key
      break
    }
  }

  let source: string | null = null
  for (const key of Object.keys(SOURCE_MAP)) {
    if (lower.includes(key)) {
      source = key
      break
    }
  }

  let language: string | null = null
  for (const pattern of POLISH_DUB_PATTERNS) {
    if (pattern.test(title)) {
      language = 'pl-dub'
      break
    }
  }
  if (language === null) {
    for (const pattern of POLISH_SUB_PATTERNS) {
      if (pattern.test(title)) {
        language = 'pl-sub'
        break
      }
    }
  }
  if (language === null) {
    for (const pattern of POLISH_LEKTOR_PATTERNS) {
      if (pattern.test(title)) {
        language = 'pl-lektor'
        break
      }
    }
  }
  if (language === null) {
    for (const pattern of ENGLISH_PATTERNS) {
      if (pattern.test(title)) {
        language = 'en'
        break
      }
    }
  }

  let group: string | null = null
  const groupMatch = title.match(/[-.]\s*([A-Za-z0-9]+)\s*$/)
  if (groupMatch !== null && groupMatch[1] !== undefined) {
    group = groupMatch[1].toLowerCase()
  }

  return { resolution, source, language, group }
}

function scoreResolution(parsed: ParsedTitle): number {
  if (parsed.resolution === null) return 5
  return RESOLUTION_MAP[parsed.resolution] ?? 5
}

function scoreLanguage(parsed: ParsedTitle): number {
  switch (parsed.language) {
    case 'pl-dub':
      return 30
    case 'pl-sub':
      return 25
    case 'pl-lektor':
      return 20
    case 'en':
      return 15
    default:
      return 5
  }
}

function scoreSeeders(seeders: number): number {
  if (seeders <= 0) return 0
  if (seeders >= 500) return 20
  if (seeders >= 100) return 17
  if (seeders >= 50) return 14
  if (seeders >= 20) return 11
  if (seeders >= 10) return 8
  if (seeders >= 5) return 5
  return 3
}

function scoreSize(sizeBytes: number, type: 'movie' | 'series'): number {
  const sizeGB = sizeBytes / (1024 * 1024 * 1024)

  if (type === 'movie') {
    if (sizeGB < 0.5) return 2
    if (sizeGB < 1) return 5
    if (sizeGB < 2) return 7
    if (sizeGB <= 15) return 10
    if (sizeGB <= 30) return 8
    if (sizeGB <= 50) return 5
    return 2
  }

  // Series: per episode size (rough estimate: total / episodes in season)
  if (sizeGB < 0.2) return 2
  if (sizeGB < 0.5) return 5
  if (sizeGB <= 2) return 7
  if (sizeGB <= 4) return 10
  if (sizeGB <= 8) return 7
  return 3
}

function scoreSource(parsed: ParsedTitle): number {
  if (parsed.source === null) return 3
  return SOURCE_MAP[parsed.source] ?? 3
}

function scoreGroup(parsed: ParsedTitle): number {
  if (parsed.group === null) return 0
  return KNOWN_GROUPS.has(parsed.group) ? 5 : 0
}

function calculateScore(result: ProwlarrResult, type: 'movie' | 'series'): number {
  const parsed = parseTorrentTitle(result.title)

  const resolution = scoreResolution(parsed)
  const language = scoreLanguage(parsed)
  const seeders = scoreSeeders(result.seeders)
  const size = scoreSize(result.size, type)
  const source = scoreSource(parsed)
  const group = scoreGroup(parsed)

  return resolution + language + seeders + size + source + group
}

export function rankTorrents(results: ProwlarrResult[], type: 'movie' | 'series' = 'movie'): RankedTorrent[] {
  const ranked = results.map((result) => {
    const score = calculateScore(result, type)
    const parsed = parseTorrentTitle(result.title)
    return { ...result, score, recommended: false, parsed }
  })

  ranked.sort((a, b) => b.score - a.score)

  const topCount = Math.min(3, ranked.length)
  for (let i = 0; i < topCount; i++) {
    const item = ranked[i]
    if (item !== undefined) {
      item.recommended = true
    }
  }

  return ranked
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = (bytes / Math.pow(1024, i)).toFixed(1)
  return `${size} ${units[i]}`
}

export function formatScore(score: number): string {
  return `${score}/100`
}
