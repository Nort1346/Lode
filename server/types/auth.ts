export interface LoginBody {
  username: string
  password: string
}

export interface RegisterBody {
  username: string
  password: string
  role?: string
  dailyDownloadLimit?: number
  activeTorrentLimit?: number
  maxTorrentSizeGb?: number
  jellyfinLibraryAccess?: string[] | 'all'
  jellyfinEnableVideoTranscoding?: boolean
  jellyfinEnableAudioTranscoding?: boolean
  jellyfinEnableRemuxing?: boolean
  jellyfinEnableLiveTvAccess?: boolean
  jellyfinEnableLiveTvManagement?: boolean
  jellyfinMaxActiveSessions?: number
}
