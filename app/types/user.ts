export interface UserProfile {
  id: string
  username: string
  role: string
  isActive: boolean
  canSubmit: boolean
  dailyDownloadLimit: number
  activeTorrentLimit: number
  maxTorrentSizeGb: number
  privateTrackerLimit: number
  downloadsToday: number
  avatarUrl: string | null
}

export interface AvatarStyleOption {
  name: string
  label: string
  preview: string
}
