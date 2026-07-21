export interface DetectedForm {
  action: string
  usernameField: string
  passwordField: string
  hiddenFields: Record<string, string>
}

export interface SessionCacheEntry {
  cookie: string
  expiresAt: number
}

export interface CreateTrackerBody {
  indexerName: string
  trackerType?: 'guid' | 'counting'
  cookie?: string
  loginUrl?: string
  loginUsername?: string
  loginPassword?: string
}

export interface UpdateTrackerBody {
  indexerName?: string
  trackerType?: 'guid' | 'counting'
  cookie?: string
  loginUrl?: string
  loginUsername?: string
  loginPassword?: string
  enabled?: boolean
}

export interface TestLoginBody {
  loginUrl?: string
  loginUsername?: string
  loginPassword?: string
}
