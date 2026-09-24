export interface ProwlarrResult {
  title: string
  indexer: string
  size: number
  seeders: number
  leechers: number
  magnetLink: string | null
  downloadUrl: string | null
  guid: string | null
  publishDate: string
  categories: number[]
  infoUrl: string
  imdbId: number | null
  isPrivate: boolean
}

export interface ProwlarrRelease {
  title: string
  indexer: string
  size: number
  seeders: number | null
  leechers: number | null
  magnetUrl: string | null
  downloadUrl: string | null
  guid: string
  publishDate: string
  categories: number[]
  infoUrl: string
  imdbId: number
}

// Progress events emitted while the query ladder runs. `index`/`total` give the
// "N of M queries done" signal, `text` is the tier query actually sent to
// Prowlarr, and `results` is the per-query hit count (cumulative totals are
// kept client-side).
export type ProwlarrProgressEvent =
  | { kind: 'start'; queries: number }
  | { kind: 'query'; state: 'start' | 'skipped'; index: number; total: number; text: string }
  | { kind: 'query'; state: 'done'; index: number; total: number; text: string; results: number }
  | { kind: 'imdb'; results: number }

export type ProwlarrProgressCallback = (event: ProwlarrProgressEvent) => void

export type TrackerType = 'guid' | 'counting'

export interface TrackerCookieConfig {
  enabled: boolean
  cookie: string
}

export interface ProwlarrDebugRelease {
  title: string
  indexer: string
  size: number
  seeders: number | null
  leechers: number | null
  magnetUrl: string | null
  downloadUrl: string | null
  guid: string
  categories: number[]
  infoUrl: string
}
