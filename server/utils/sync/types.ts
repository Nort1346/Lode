export interface SyncProvider {
  name: string
  isEnabled(): Promise<boolean>
  createUser(data: SyncUserData): Promise<string>
  updateUserPassword(providerUserId: string, password: string): Promise<void>
  findUserByName(username: string): Promise<string | null>
  updateUser(providerUserId: string, data: SyncUserData): Promise<void>
  deleteUser(providerUserId: string): Promise<void>
  disableUser(providerUserId: string): Promise<void>
  enableUser(providerUserId: string): Promise<void>
  updateUserSettings(providerUserId: string, settings: SyncUserSettings): Promise<void>
  setAvatar(providerUserId: string, imageBuffer: Buffer): Promise<void>
  deleteAvatar(providerUserId: string): Promise<void>
  getLibraries(): Promise<Array<SyncLibrary>>
  isItemInLibrary?(tmdbId: number): Promise<boolean>
}

export interface SyncUserData {
  username: string
  password: string
}

export interface SyncUserSettings {
  libraryAccess: string[] | 'all'
  enableVideoTranscoding: boolean
  enableAudioTranscoding: boolean
  enableRemuxing: boolean
  enableLiveTvAccess: boolean
  enableLiveTvManagement: boolean
  maxActiveSessions: number
}

export interface SyncLibrary {
  id: string
  name: string
  path: string
}

export interface SyncStatus {
  providerName: string
  providerUserId: string | null
  syncStatus: 'synced' | 'pending' | 'failed'
  lastSyncError: string | null
}

export interface JellyfinPresetsBody {
  syncEnabled?: boolean
  libraryAccess?: string[] | 'all'
  videoTranscoding?: boolean
  audioTranscoding?: boolean
  remuxing?: boolean
  liveTvAccess?: boolean
  liveTvManagement?: boolean
  maxActiveSessions?: number
}
