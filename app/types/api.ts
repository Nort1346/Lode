export interface RateLimitPayload {
  code?: 'cooldown' | 'active-limit' | 'daily-limit' | 'private-tracker-limit'
  cooldownSeconds?: number
  limit?: number
  activeCount?: number
  todayCount?: number
}

export interface ApiError {
  data?: { statusMessage?: string; statusCode?: number; data?: RateLimitPayload }
  statusMessage?: string
  statusCode?: number
  status?: number
}
