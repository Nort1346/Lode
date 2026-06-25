export interface AdminUser {
  id: string
  username: string
  role: string
  isActive: boolean
  dailyDownloadLimit: number
  activeTorrentLimit: number
  maxTorrentSizeGb: number
  privateTrackerLimit: number
  downloadsToday: number
  createdAt: string
  discordId: string | null
  canSubmit: boolean
  maxSessions: number
}

export interface ActivityLog {
  id: string
  userId: string | null
  username: string | null
  action: string
  details: string | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface BruteForceConfig {
  maxAttemptsPerIp: number
  ipBlockDurationMinutes: number
  windowMinutes: number
}

export interface BruteForceStats {
  blockedIpsCount: number
  recentAttempts24h: number
  recentFailed24h: number
  recentSuccess24h: number
}

export interface BlockedIp {
  ip: string
  expiresAt: number
  attemptsCount: number
}

export interface Session {
  id: string
  userId: string
  ip: string | null
  userAgent: string | null
  deviceName: string | null
  createdAt: string
  lastActiveAt: string
  username: string | null
  role: string | null
}

export interface CustomTracker {
  id: string
  indexerName: string
  trackerType: 'guid' | 'counting'
  cookie: string
  loginUrl: string | null
  loginUsername: string | null
  loginPassword: string | null
  enabled: boolean
  createdAt: string
}
