export interface SyncProvider {
  name: string
  isEnabled(): Promise<boolean>
  createUser(data: SyncUserData): Promise<string>
  // Optional: not every provider can set a password (Plex accounts are managed
  // on plex.tv and have no API-settable password). The orchestrator skips these
  // with a debug log when a provider does not implement them.
  updateUserPassword?(providerUserId: string, password: string): Promise<void>
  findUserByName(username: string): Promise<string | null>
  updateUser?(providerUserId: string, data: SyncUserData): Promise<void>
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
  // Plex-only (ignored by Jellyfin): per-user "allow sync" (downloads). Optional
  // so Jellyfin payloads and existing literals stay valid; the Plex provider
  // falls back to the server-wide PLEX_DEFAULT_SYNC when it is undefined.
  enableSync?: boolean
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

// Optional per-provider settings overrides passed alongside the primary
// `SyncUserSettings`. The primary object is the default for every provider;
// an entry here wins for that provider only. Needed because `libraryAccess`
// means different things per provider (Jellyfin library IDs vs Plex section
// keys), so a single object cannot serve both when two servers are connected.
export interface ProviderSettingsMap {
  [providerName: string]: SyncUserSettings
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

// Plex has no per-user transcoding/remuxing/session controls: those live in the
// Plex client settings. Only the invite-based sync toggles are configurable.
export interface PlexPresetsBody {
  syncEnabled?: boolean
  libraryAccess?: string[] | 'all'
  liveTvAccess?: boolean
  sync?: boolean
}
