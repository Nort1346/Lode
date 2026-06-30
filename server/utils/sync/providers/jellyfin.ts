import type { SyncProvider, SyncUserData, SyncUserSettings, SyncLibrary } from '../types'
import type { JellyfinClient } from '#server/utils/jellyfin'
import { useJellyfin } from '#server/utils/jellyfin'
import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export class JellyfinSyncProvider implements SyncProvider {
  name = 'jellyfin'

  private getClient(): JellyfinClient {
    const client = useJellyfin()
    if (!client) {
      throw new Error('Jellyfin is not configured')
    }
    return client
  }

  async isEnabled(): Promise<boolean> {
    const setting = getSetting(SETTINGS.JELLYFIN_SYNC_ENABLED)
    if (setting === 'false') return false

    const client = useJellyfin()
    return client !== null
  }

  async createUser(data: SyncUserData): Promise<string> {
    const client = this.getClient()
    const result = await client.createUser(data.username, data.password)
    return result.Id
  }

  async updateUserPassword(providerUserId: string, password: string): Promise<void> {
    const client = this.getClient()
    await client.updateUserPassword(providerUserId, password)
  }

  async findUserByName(username: string): Promise<string | null> {
    const client = this.getClient()
    const user = await client.getUserByName(username)
    return user?.Id ?? null
  }

  async updateUser(providerUserId: string, data: SyncUserData): Promise<void> {
    const client = this.getClient()
    await client.updateUser(providerUserId, { Name: data.username })
  }

  async deleteUser(providerUserId: string): Promise<void> {
    const client = this.getClient()
    await client.deleteUser(providerUserId)
  }

  async disableUser(providerUserId: string): Promise<void> {
    const client = this.getClient()
    await client.disableUser(providerUserId)
  }

  async enableUser(providerUserId: string): Promise<void> {
    const client = this.getClient()
    await client.enableUser(providerUserId)
  }

  async updateUserSettings(providerUserId: string, settings: SyncUserSettings): Promise<void> {
    const client = this.getClient()

    const user = await client.getUser(providerUserId)
    const existingPolicy = (user.Policy ?? {}) as Record<string, unknown>

    const enabledFolders = Array.isArray(settings.libraryAccess)
      ? settings.libraryAccess.filter((id) =>
          /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id)
        )
      : []

    const policy: Record<string, unknown> = {
      IsAdministrator: existingPolicy.IsAdministrator ?? false,
      IsHidden: existingPolicy.IsHidden ?? false,
      IsDisabled: existingPolicy.IsDisabled ?? false,
      EnableAllFolders: settings.libraryAccess === 'all',
      EnabledFolders: enabledFolders,
      EnableMediaPlayback: true,
      EnableLiveTvAccess: settings.enableLiveTvAccess,
      EnableLiveTvManagement: settings.enableLiveTvManagement,
      MaxActiveSessions: settings.maxActiveSessions,
      EnableVideoPlaybackTranscoding: settings.enableVideoTranscoding,
      EnableAudioPlaybackTranscoding: settings.enableAudioTranscoding,
      EnablePlaybackRemuxing: settings.enableRemuxing,
      AuthenticationProviderId:
        existingPolicy.AuthenticationProviderId ??
        'Jellyfin.Server.Implementations.Users.DefaultAuthenticationProvider',
      PasswordResetProviderId:
        existingPolicy.PasswordResetProviderId ?? 'Jellyfin.Server.Implementations.Users.DefaultAuthenticationProvider'
    }

    await client.updateUserPolicy(providerUserId, policy)
  }

  async setAvatar(providerUserId: string, imageBuffer: Buffer): Promise<void> {
    const client = this.getClient()
    await client.setUserImage(providerUserId, imageBuffer, 'image/jpeg')
  }

  async deleteAvatar(providerUserId: string): Promise<void> {
    const client = this.getClient()
    await client.deleteUserImage(providerUserId)
  }

  async getLibraries(): Promise<SyncLibrary[]> {
    const client = this.getClient()
    const libs = await client.getLibraries()
    return libs.map((lib) => ({
      id: lib.Id,
      name: lib.Name,
      path: lib.Path
    }))
  }

  async isItemInLibrary(tmdbId: number): Promise<boolean> {
    const client = this.getClient()
    return client.isItemInLibrary(tmdbId)
  }
}
