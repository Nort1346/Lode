import type { SyncProvider, SyncUserData, SyncUserSettings, SyncLibrary } from '../types'
import type { PlexClients } from '#server/utils/clients/plex'
import { usePlex } from '#server/utils/clients/plex'
import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'
import { createLogger } from '#server/utils/logger'

const log = createLogger('PlexSync')

// Plex sync provider. The Plex model differs from Jellyfin in two key ways:
//   1. Users live on plex.tv - Lode creates managed home users (or invites
//      existing accounts) and manages access through server shares, not local
//      passwords. `updateUserPassword` / `updateUser` are intentionally NOT
//      implemented (optional on SyncProvider), so the orchestrator skips them.
//   2. There is no per-user API for transcoding/remuxing/sessions/avatar - the
//      per-user surface is: library access, Live TV (allowTuners), downloads
//      (allowSync). The Jellyfin-only columns are ignored here.
export class PlexSyncProvider implements SyncProvider {
  name = 'plex'

  private getClients(): PlexClients {
    const clients = usePlex()
    if (!clients) {
      throw new Error('Plex is not configured')
    }
    return clients
  }

  async isEnabled(): Promise<boolean> {
    const setting = await getSetting(SETTINGS.PLEX_SYNC_ENABLED)
    if (setting === 'false') return false
    return usePlex() !== null
  }

  // Managed user creation only - the server share (library access) is applied by
  // updateUserSettings, which the orchestrator calls immediately afterwards.
  async createUser(data: SyncUserData): Promise<string> {
    const clients = this.getClients()
    const user = await clients.tv.createManagedUser({ title: data.username })
    log.info(`created Plex managed user "${data.username}" (id: ${user.id})`)
    return String(user.id)
  }

  async findUserByName(username: string): Promise<string | null> {
    const clients = this.getClients()
    const users = await clients.tv.getHomeUsers()
    const needle = username.toLowerCase()
    const match = users.find(
      (u) => (u.title ?? '').toLowerCase() === needle || (u.username ?? '').toLowerCase() === needle
    )
    if (match === undefined) return null
    return String(match.id)
  }

  // Share first, then the home user. Share removal is best-effort: the home user
  // can be deleted regardless, and the orchestrator logs (not rethrows) failures.
  async deleteUser(providerUserId: string): Promise<void> {
    const clients = this.getClients()
    const userId = Number(providerUserId)
    try {
      await clients.tv.removeShare(userId)
    } catch (error) {
      log.debug(`no share to remove for Plex user ${userId} (ok):`, error)
    }
    await clients.tv.deleteHomeUser(userId)
    log.info(`deleted Plex home user ${userId}`)
  }

  // D2: disable = remove the server share (keeps home membership, loses access).
  // Swallowed on failure: Lode-side `is_active` remains the authoritative gate,
  // so a leftover share does not re-grant access inside Lode.
  async disableUser(providerUserId: string): Promise<void> {
    const clients = this.getClients()
    try {
      await clients.tv.removeShare(Number(providerUserId))
    } catch (error) {
      log.warn(`could not remove Plex share for user ${providerUserId} (is_active still gates access):`, error)
    }
  }

  // D2: enable = restore a share using the server-wide defaults.
  async enableUser(providerUserId: string): Promise<void> {
    const clients = this.getClients()
    const settings = await this.defaultShareSettings()
    await this.applyShare(clients, Number(providerUserId), settings)
  }

  async updateUserSettings(providerUserId: string, settings: SyncUserSettings): Promise<void> {
    const clients = this.getClients()
    await this.applyShare(clients, Number(providerUserId), settings)
  }

  // No Plex avatar API (avatars are account-scoped on plex.tv) - no-op so the
  // sync status stays "synced" instead of failing (D1).
  async setAvatar(_providerUserId: string, _imageBuffer: Buffer): Promise<void> {
    log.debug('avatar sync is a no-op for Plex (no API)')
  }

  async deleteAvatar(_providerUserId: string): Promise<void> {
    log.debug('avatar delete is a no-op for Plex (no API)')
  }

  async getLibraries(): Promise<SyncLibrary[]> {
    const clients = this.getClients()
    const sections = await clients.pms.getSections()
    return sections.map((section) => ({
      id: section.key,
      name: section.title,
      path: section.Location?.[0]?.path ?? ''
    }))
  }

  async isItemInLibrary(tmdbId: number): Promise<boolean> {
    const clients = this.getClients()
    return clients.pms.isItemInLibrary(tmdbId)
  }

  // ===== helpers =====

  // Creates the server share after removing any existing one, so a re-apply
  // always ends in a fresh, correct share. plex.tv returns 422 on create-when-
  // already-shared, and we do not track share ids - remove-then-create avoids
  // needing them. The remove is best-effort (no prior share is expected).
  private async applyShare(clients: PlexClients, userId: number, settings: SyncUserSettings): Promise<void> {
    const machineId = await clients.pms.getMachineIdentifier()
    const sectionIds = await this.resolveSectionIds(clients, settings.libraryAccess)
    const allowTuners = settings.enableLiveTvAccess
    const allowSync = settings.enableSync ?? (await getSetting(SETTINGS.PLEX_DEFAULT_SYNC)) !== 'false'

    try {
      await clients.tv.removeShare(userId)
    } catch (error) {
      log.debug(`no existing share for Plex user ${userId} before apply (ok):`, error)
    }
    await clients.tv.createShare(machineId, userId, sectionIds, { allowSync, allowTuners })
  }

  private async resolveSectionIds(clients: PlexClients, libraryAccess: string[] | 'all'): Promise<number[]> {
    if (libraryAccess === 'all') {
      const sections = await clients.pms.getSections()
      return sections.map((section) => Number(section.key)).filter((id) => Number.isFinite(id))
    }
    return libraryAccess.map((value) => Number(value)).filter((id) => Number.isFinite(id))
  }

  // Server-wide defaults used when re-granting access on enable (the caller has
  // no per-user settings in scope). Fields Plex does not use are set to harmless
  // values so the shared SyncUserSettings shape stays complete. Kept separate
  // from getPlexSyncSettings() (server/utils/sync/index.ts) to avoid a circular
  // import between the orchestrator and this provider.
  private async defaultShareSettings(): Promise<SyncUserSettings> {
    return {
      libraryAccess: JSON.parse((await getSetting(SETTINGS.PLEX_DEFAULT_LIBRARY_ACCESS)) ?? '"all"') as
        string[] | 'all',
      enableVideoTranscoding: true,
      enableAudioTranscoding: true,
      enableRemuxing: true,
      enableLiveTvAccess: (await getSetting(SETTINGS.PLEX_DEFAULT_LIVE_TV_ACCESS)) !== 'false',
      enableLiveTvManagement: false,
      enableSync: (await getSetting(SETTINGS.PLEX_DEFAULT_SYNC)) !== 'false',
      maxActiveSessions: 0
    }
  }
}
