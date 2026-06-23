import type { ProwlarrResult } from '#server/types/prowlarr'

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

export interface RankingSizeThreshold {
  min: number
  max: number
  score: number
}

export interface RankingLanguage {
  code: string
  score: number
  patterns: string[]
  isFallback?: boolean
}

export interface RankingConfig {
  weights: {
    resolution: number
    language: number
    seeders: number
    size: number
    source: number
    group: number
  }
  resolutions: Record<string, number>
  sources: Record<string, number>
  languages: RankingLanguage[]
  knownGroups: string[]
  sizeThresholds: {
    movie: RankingSizeThreshold[]
    series: RankingSizeThreshold[]
    seasonPack: RankingSizeThreshold[]
  }
  titleRelevance: {
    wordWeight: number
    yearWeight: number
    fullTitleWeight: number
    penalty: number
  }
  recommendedCount: number
}

export const DEFAULT_RANKING_CONFIG: RankingConfig = {
  weights: {
    resolution: 40,
    language: 30,
    seeders: 100,
    size: 20,
    source: 10,
    group: 5
  },
  resolutions: {
    '2160p': 20,
    '4k': 20,
    '1080p': 40,
    '720p': 20,
    '480p': 5,
    '576p': 5
  },
  sources: {
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
  },
  languages: [
    {
      code: 'pl-dub',
      score: 30,
      patterns: ['pldub', 'pl[\\s.]?dub', 'polish[\\s.]?dub', 'dubbing[\\s.]?pl', 'pl[\\s-]?audio']
    },
    {
      code: 'pl-lektor',
      score: 25,
      patterns: ['lektor[\\s.]?pl', 'pl[\\s.]?lek', 'lektor']
    },
    {
      code: 'pl-sub',
      score: 22,
      patterns: [
        'plsub',
        'pl[\\s.]?sub',
        'polish[\\s.]?sub',
        'napisy[\\s.]?pl',
        'pl[\\s.]?napi',
        'napisypl',
        'sub[\\s.]?pl'
      ]
    },
    {
      code: 'en',
      score: 15,
      patterns: ['\\beng(?:lish)?[\\s.]?(?:sub|dub)?', '\\ben[\\s.]?(?:sub|dub)']
    },
    {
      code: 'other',
      score: 8,
      patterns: [],
      isFallback: true
    }
  ],
  knownGroups: [
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
  ],
  sizeThresholds: {
    movie: [
      { min: 0, max: 0.5, score: 3 },
      { min: 0.5, max: 1, score: 8 },
      { min: 1, max: 2, score: 12 },
      { min: 2, max: 15, score: 20 },
      { min: 15, max: 30, score: 15 },
      { min: 30, max: 50, score: 8 },
      { min: 50, max: Infinity, score: 3 }
    ],
    series: [
      { min: 0, max: 0.2, score: 3 },
      { min: 0.2, max: 0.5, score: 8 },
      { min: 0.5, max: 2, score: 12 },
      { min: 2, max: 4, score: 20 },
      { min: 4, max: 8, score: 12 },
      { min: 8, max: Infinity, score: 5 }
    ],
    seasonPack: [
      { min: 0, max: 5, score: 5 },
      { min: 5, max: 20, score: 12 },
      { min: 20, max: 50, score: 20 },
      { min: 50, max: 100, score: 15 },
      { min: 100, max: Infinity, score: 5 }
    ]
  },
  titleRelevance: {
    wordWeight: 15,
    yearWeight: 10,
    fullTitleWeight: 10,
    penalty: -20
  },
  recommendedCount: 3
}
