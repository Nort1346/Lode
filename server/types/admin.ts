export interface CreateUserBody {
  username: string
  password: string
  role?: string
  dailyDownloadLimit?: number
  activeTorrentLimit?: number
  maxTorrentSizeGb?: number
  privateTrackerLimit?: number
  canSubmit?: boolean
  maxSessions?: number
  discordId?: string | null
  jellyfinLibraryAccess?: string[] | 'all'
  jellyfinEnableVideoTranscoding?: boolean
  jellyfinEnableAudioTranscoding?: boolean
  jellyfinEnableRemuxing?: boolean
  jellyfinEnableLiveTvAccess?: boolean
  jellyfinEnableLiveTvManagement?: boolean
  jellyfinMaxActiveSessions?: number
  expiresAt?: string | null
}

export interface UpdateUserBody {
  username?: string
  password?: string
  role?: string
  isActive?: boolean
  dailyDownloadLimit?: number
  activeTorrentLimit?: number
  maxTorrentSizeGb?: number
  privateTrackerLimit?: number
  downloadsToday?: number
  discordId?: string | null
  canSubmit?: boolean
  maxSessions?: number
  jellyfinLibraryAccess?: string[] | 'all'
  jellyfinEnableVideoTranscoding?: boolean
  jellyfinEnableAudioTranscoding?: boolean
  jellyfinEnableRemuxing?: boolean
  jellyfinEnableLiveTvAccess?: boolean
  jellyfinEnableLiveTvManagement?: boolean
  jellyfinMaxActiveSessions?: number
  expiresAt?: string | null
}

export interface DefaultsBody {
  dailyDownloadLimit?: number
  activeTorrentLimit?: number
  maxTorrentSizeGb?: number
  privateTrackerLimit?: number
  maxSessions?: number
  canSubmit?: boolean
}

export interface ServiceStatus {
  name: string
  configured: boolean
  status: 'up' | 'down' | 'not_configured'
  latencyMs?: number
  details?: string
}
