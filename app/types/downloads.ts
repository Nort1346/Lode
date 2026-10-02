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

export type EtaState = 'waiting-seeders' | 'calculating' | 'ready'

export type EtaInput = Pick<Download, 'etaSeconds' | 'numSeeds' | 'downloadSpeed'>

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
