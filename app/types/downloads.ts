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

export type TorrentQuality = 'dead' | 'poor' | 'slow' | 'ok'

export type EtaState = 'waiting-seeders' | 'calculating' | 'ready'

export type EtaInput = Pick<Download, 'etaSeconds' | 'numSeeds' | 'downloadSpeed'>

export const STATUS_COLORS: Record<string, string> = {
  downloading: 'text-blue-500',
  seeding: 'text-green-500',
  paused: 'text-yellow-500',
  queued: 'text-purple-500',
  completed: 'text-emerald-500',
  failed: 'text-red-500',
  disk_full: 'text-red-500',
  removed: 'text-zinc-500'
}
