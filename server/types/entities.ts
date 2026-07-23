export interface User {
  id: string
  username: string
  password: string
  role: 'user' | 'admin'
  isActive: boolean
  dailyDownloadLimit: number
  activeTorrentLimit: number
  maxTorrentSizeGb: number
  privateTrackerLimit: number
  downloadsToday: number
  downloadsResetAt: string | null
  createdAt: string
  discordId: string | null
  canSubmit: boolean
  maxSessions: number
  avatarUrl: string | null
  expiresAt: string | null
  syncStatus: 'synced' | 'pending' | 'failed'
}

export type CreateUserInput = Omit<User, 'syncStatus'>
export type UpdateUserInput = Partial<Omit<User, 'id'>>

export interface Download {
  id: string
  userId: string
  label: string
  torrentName: string
  magnetLink: string
  savePath: 'movies' | 'series' | 'games' | 'books' | 'music'
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'paused' | 'removed' | 'disk_full'
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
  tmdbId: number | null
  mediaType: 'movie' | 'tv' | null
  posterUrl: string | null
  isPrivate: boolean
}

export type CreateDownloadInput = Omit<Download, 'status' | 'progress' | 'etaSeconds' | 'downloadSpeed' | 'uploadSpeed' | 'downloadedBytes' | 'numSeeds' | 'numLeechs' | 'completedAt'>
export type UpdateDownloadInput = Partial<Omit<Download, 'id'>>

export interface Setting {
  key: string
  value: string
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

export interface Request {
  id: string
  userId: string
  username: string
  mediaType: 'movie' | 'tv'
  mediaId: number
  mediaTitle: string
  mediaPoster: string | null
  status: 'pending' | 'accepted' | 'rejected'
  userNote: string | null
  adminNote: string | null
  createdAt: string
  updatedAt: string | null
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

export interface LoginAttempt {
  id: string
  ip: string
  username: string | null
  success: boolean
  userAgent: string | null
  createdAt: string
}

export interface Session {
  id: string
  userId: string
  ip: string | null
  userAgent: string | null
  deviceName: string | null
  createdAt: string
  lastActiveAt: string
}

export interface WishlistItem {
  id: string
  userId: string
  mediaType: 'movie' | 'tv'
  mediaId: number
  mediaTitle: string
  mediaPoster: string | null
  createdAt: string
}

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  message: string
  link: string | null
  data: string | null
  read: boolean
  createdAt: string
}

export interface PushSubscription {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
  createdAt: string
  lastUsedAt: string | null
}

export interface SyncProvider {
  id: string
  userId: string
  providerName: string
  providerUserId: string
  syncStatus: 'synced' | 'pending' | 'failed'
  lastSyncError: string | null
  createdAt: string
  updatedAt: string
}

export interface SyncUserSettings {
  id: string
  userId: string
  providerName: string
  libraryAccess: string
  enableVideoTranscoding: boolean
  enableAudioTranscoding: boolean
  enableRemuxing: boolean
  enableLiveTvAccess: boolean
  enableLiveTvManagement: boolean
  maxActiveSessions: number
  createdAt: string
  updatedAt: string
}
