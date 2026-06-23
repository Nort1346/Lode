export interface BruteForceConfig {
  maxAttemptsPerIp: number
  ipBlockDurationMinutes: number
  windowMinutes: number
}

export interface BlockedIpEntry {
  ip: string
  expiresAt: number
  attemptsCount: number
}

export interface BruteForceStats {
  blockedIpsCount: number
  recentAttempts24h: number
  recentFailed24h: number
  recentSuccess24h: number
}
