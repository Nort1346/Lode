export interface JellyfinUserFieldsProps {
  jellyfinLibraryAccess: string[] | 'all'
  jellyfinEnableVideoTranscoding: boolean
  jellyfinEnableAudioTranscoding: boolean
  jellyfinEnableRemuxing: boolean
  jellyfinEnableLiveTvAccess: boolean
  jellyfinEnableLiveTvManagement: boolean
  jellyfinMaxActiveSessions: number
  editing?: boolean
  avatarUrl?: string | null
  username?: string
}
