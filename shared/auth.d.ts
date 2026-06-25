declare module '#auth-utils' {
  interface User {
    id: string
    username: string
    role: 'user' | 'admin'
    isActive: boolean
    dailyDownloadLimit: number
    activeTorrentLimit: number
    maxTorrentSizeGb: number
    privateTrackerLimit: number
    downloadsToday: number
  }

  interface UserSession {
    sessionId?: string
  }
}

export {}
