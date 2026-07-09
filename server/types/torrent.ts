import type { ProwlarrResult } from '#server/types/prowlarr'

export interface TorrentFile {
  index: number
  name: string
  size: number
  progress: number
  priority: number
}

export interface QBitTorrent {
  hash: string
  name: string
  progress: number
  eta: number
  dlspeed: number
  upspeed: number
  size: number
  downloaded: number
  num_seeds: number
  num_complete: number
  num_leechs: number
  state: string
  save_path: string
  category: string
  tags: string
  added_on: number
  completion_on: number
}

export interface RankedTorrent extends ProwlarrResult {
  score: number
  percentage: number
  recommended: boolean
  parsed: ParsedTitle
  isSeasonPack: boolean
}

export interface ParsedTitle {
  resolution: string | null
  source: string | null
  language: string | null
  group: string | null
}

export interface TorrentMeta {
  resolution: string | null
  source: string | null
  language: string | null
  codec: string | null
}

export type SavePathKey = 'movies' | 'series' | 'games' | 'books' | 'music'
