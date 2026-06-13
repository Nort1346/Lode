declare module '#auth-utils' {
  interface UserSession {
    user: {
      id: string
      username: string
      role: 'user' | 'admin'
      isActive: boolean
      dailyDownloadLimit: number
      activeTorrentLimit: number
      maxTorrentSizeGb: number
      downloadsToday: number
    }
  }
}

export {}
