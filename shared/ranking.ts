// Shared between the server (ranking engine, config API) and the admin ranking page

// JSON-safe stand-in for "no upper size bound" (1e9 GB is far beyond any real file)
export const RANKING_SIZE_UNLIMITED = 1e9

export interface RankingSizeThreshold {
  min: number
  max: number
  score: number
}

export interface RankingFormat {
  code: string
  label: string
  score: number
  patterns: string[]
}

export interface RankingLanguageProfile {
  code: string
  label: string
  formats: RankingFormat[]
  isPreferred?: boolean
  isFallback?: boolean
}

// Legacy type - kept for migration from old config format
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
  languageProfiles: RankingLanguageProfile[]
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
  languageProfiles: [
    {
      code: 'pl',
      label: 'Polish',
      formats: [
        {
          code: 'dub',
          label: 'Dubbing',
          score: 30,
          patterns: ['pldub', 'pl[\\s.]?dub', 'polish[\\s.]?dub', 'dubbing[\\s.]?pl', 'pl[\\s-]?audio']
        },
        {
          code: 'lektor',
          label: 'Lektor',
          score: 25,
          patterns: ['lektor[\\s.]?pl', 'pl[\\s.]?lek', 'lektor']
        },
        {
          code: 'sub',
          label: 'Subtitles',
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
        }
      ]
    },
    {
      code: 'de',
      label: 'German',
      formats: [
        {
          code: 'dub',
          label: 'Dubbing',
          score: 30,
          patterns: ['german[\\s.]?dub', 'de[\\s.]?dub', 'deutsch[\\s.]?dub', 'dedub', 'de[\\s-]?audio']
        },
        {
          code: 'sub',
          label: 'Subtitles',
          score: 22,
          patterns: ['german[\\s.]?sub', 'de[\\s.]?sub', 'deutsch[\\s.]?sub']
        }
      ]
    },
    {
      code: 'fr',
      label: 'French',
      formats: [
        {
          code: 'dub',
          label: 'Dubbing',
          score: 30,
          patterns: ['french[\\s.]?dub', 'fr[\\s.]?dub', 'vf[\\s.]', 'français[\\s.]?dub', 'fr[\\s-]?audio']
        },
        {
          code: 'vostfr',
          label: 'VOSTFR',
          score: 25,
          patterns: ['vostfr', 'vo[\\s.]?st[\\s.]?fr']
        },
        {
          code: 'sub',
          label: 'Subtitles',
          score: 22,
          patterns: ['french[\\s.]?sub', 'fr[\\s.]?sub', 'français[\\s.]?sub']
        }
      ]
    },
    {
      code: 'es',
      label: 'Spanish',
      formats: [
        {
          code: 'dub',
          label: 'Dubbing',
          score: 30,
          patterns: ['spanish[\\s.]?dub', 'es[\\s.]?dub', 'español[\\s.]?dub', 'es[\\s-]?audio']
        },
        {
          code: 'sub',
          label: 'Subtitles',
          score: 22,
          patterns: ['spanish[\\s.]?sub', 'es[\\s.]?sub', 'español[\\s.]?sub']
        }
      ]
    },
    {
      code: 'pt-br',
      label: 'Portuguese (Brazil)',
      formats: [
        {
          code: 'dub',
          label: 'Dubbing',
          score: 30,
          patterns: [
            'brazilian[\\s.]?portuguese[\\s.]?dub',
            'pt[\\s.]?br[\\s.]?dub',
            'dublagem',
            'pt[\\s-]?audio'
          ]
        },
        {
          code: 'sub',
          label: 'Subtitles',
          score: 22,
          patterns: ['brazilian[\\s.]?portuguese[\\s.]?sub', 'pt[\\s.]?br[\\s.]?sub', 'legenda']
        }
      ]
    },
    {
      code: 'en',
      label: 'English',
      isPreferred: true,
      formats: [
        {
          code: 'dub',
          label: 'Dubbing',
          score: 30,
          patterns: ['english[\\s.]?dub', 'en[\\s.]?dub', 'en[\\s-]?audio']
        },
        {
          code: 'sub',
          label: 'Subtitles',
          score: 22,
          patterns: ['english[\\s.]?sub', 'en[\\s.]?sub']
        }
      ]
    },
    {
      code: 'other',
      label: 'Other',
      isFallback: true,
      formats: [
        {
          code: 'original',
          label: 'Original',
          score: 8,
          patterns: []
        }
      ]
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
      { min: 50, max: RANKING_SIZE_UNLIMITED, score: 3 }
    ],
    series: [
      { min: 0, max: 0.2, score: 3 },
      { min: 0.2, max: 0.5, score: 8 },
      { min: 0.5, max: 2, score: 12 },
      { min: 2, max: 4, score: 20 },
      { min: 4, max: 8, score: 12 },
      { min: 8, max: RANKING_SIZE_UNLIMITED, score: 5 }
    ],
    seasonPack: [
      { min: 0, max: 5, score: 5 },
      { min: 5, max: 20, score: 12 },
      { min: 20, max: 50, score: 20 },
      { min: 50, max: 100, score: 15 },
      { min: 100, max: RANKING_SIZE_UNLIMITED, score: 5 }
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
