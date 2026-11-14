import type { EtaInput, EtaState } from '#shared/eta-tracker'

export type { EtaDisplay, EtaTrackerInput, EtaTrackerRegistry, EtaTrackerState } from '#shared/eta-tracker'
export type { EtaInput, EtaState }

export interface Download {
  id: string
  userId: string
  username?: string
  label: string
  torrentName: string
  magnetLink: string
  savePath: string
  status: string
  torrentHash: string | null
  progress: number
  etaSeconds: number
  // Server-computed ETA state shared by all users. Optional so an older API
  // response (or a locally constructed row) falls back to getEtaState().
  etaState?: EtaState
  downloadSpeed: number
  uploadSpeed: number
  sizeBytes: number
  downloadedBytes: number
  numSeeds: number
  numLeechs: number
  createdAt: string
  completedAt: string | null
  notifiedAt: string | null
  posterUrl: string | null
  indexerName: string | null
  resolution: string | null
  organizeStatus: 'pending' | 'done' | 'failed' | 'skipped'
  organizeError: string | null
  // Present only while an import is actually copying bytes; the dashboard uses
  // it for the preparation bar that follows the download bar.
  organizeProgress?: OrganizeProgress | null
}

export interface OrganizeProgress {
  percent: number
  copiedBytes: number
  totalBytes: number
  speedBytesPerSecond: number
  filesDone: number
  filesTotal: number
}

// Response of /api/torrents/add and /api/browse/download.
// Exactly one flag is set: already (an active Lode row already exists) or
// alreadyComplete/alreadyDownloading (the torrent is already in qBittorrent).
// None of them is set when a new download row was created.
export interface AddTorrentResponse {
  already?: boolean
  alreadyComplete?: boolean
  alreadyDownloading?: boolean
  name?: string
}

export type TorrentQuality = 'dead' | 'poor' | 'slow' | 'ok'

export const STATUS_COLORS: Record<string, string> = {
  checking: 'text-teal-500',
  downloading: 'text-blue-500',
  seeding: 'text-green-500',
  paused: 'text-yellow-500',
  queued: 'text-purple-500',
  completed: 'text-emerald-500',
  failed: 'text-red-500',
  disk_full: 'text-red-500',
  removed: 'text-zinc-500'
}
