import type { ProwlarrResult } from '#server/types/prowlarr'
import type { InferSelectModel } from 'drizzle-orm'
import type { downloads } from '#server/database/schema'

export type DownloadRow = InferSelectModel<typeof downloads> & { username?: string }

export const DOWNLOAD_STATUS_VALUES = ['pending', 'downloading', 'completed', 'failed', 'paused', 'removed'] as const
export type SupportedStatus = (typeof DOWNLOAD_STATUS_VALUES)[number]

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

export const SAVE_PATH_KEYS = ['movies', 'series', 'games', 'music', 'books'] as const

export interface AddTorrentBody {
  magnetLink?: string
  downloadUrl?: string
  torrentFile?: string
  fileName?: string
  savePath: string
  label?: string
  tmdbId?: number
  mediaType?: string
}

export interface MutexEntry {
  resolve: () => void
}

export interface SyncResult {
  synced: number
  completed: number
  failed: number
}
