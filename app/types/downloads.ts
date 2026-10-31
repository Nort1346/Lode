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
  organizeStatus: 'pending' | 'done' | 'failed' | 'skipped'
  organizeError: string | null
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

// 'collecting' = the warm-up window is still running (no numeric ETA yet,
// the card shows the neutral "collecting data" state).
export type EtaState = 'collecting' | 'waiting-seeders' | 'calculating' | 'ready'

export type EtaInput = Pick<Download, 'etaSeconds' | 'numSeeds' | 'downloadSpeed'>

// What the ETA tracker needs from a download row.
export type EtaTrackerInput = Pick<
  Download,
  'id' | 'status' | 'createdAt' | 'sizeBytes' | 'downloadedBytes' | 'numSeeds' | 'downloadSpeed'
>

// Result of the ETA display pipeline for one download row.
export interface EtaDisplay {
  state: EtaState
  etaSeconds: number | null
}

// Client-side speed-sampling registry: one EtaTrackerState per active download,
// in-memory only (nothing is persisted).
export interface EtaTrackerRegistry {
  trackPoll(downloads: readonly EtaTrackerInput[], nowMs: number): void
  displayFor(dl: EtaTrackerInput, nowMs: number): EtaDisplay
  size(): number
}

// Per-download speed sampling state (in-memory, client-side only).
export interface EtaTrackerState {
  createdAtMs: number | null
  lastBytes: number | null
  lastSampleAt: number | null
  lastStatus: string | null
  // Recent speed samples in bytes/s (0 = no progress during that poll);
  // at most ETA_SPEED_WINDOW entries, oldest first.
  window: number[]
  // Samples with actual progress since the last anchor reset.
  validSamples: number
  // Progress observed (bytes) since the last anchor reset.
  bytesObserved: number
  // Last candidate ETA in seconds that was shown (hysteresis anchor), raw value.
  lastDisplayedEta: number | null
  lastSeenAt: number
}

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
