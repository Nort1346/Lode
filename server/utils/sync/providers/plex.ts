import type { SyncProvider, SyncUserData, SyncUserSettings, SyncLibrary } from '../types'
import type { PlexClients } from '#server/utils/clients/plex'
import type { PlexShareSettings } from '#server/types/plex'
import { usePlex } from '#server/utils/clients/plex'
import { buildPlexSyncSettings } from '../provider-settings'
import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'
import { createLogger } from '#server/utils/logger'

const log = createLogger('PlexSync')

// Plex sync provider. The Plex model differs from Jellyfin in two key ways:
//   1. Users live on plex.tv - Lode creates managed home users and manages
//      access through server shares, not local passwords.
//      `updateUserPassword` / `updateUser` are intentionally NOT implemented
//      (optional on SyncProvider), so the orchestrator skips them.
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

  // Applies the server share for a Plex user. Prefers updating the existing
  // share: recreating it (remove + create) loses the user's access entirely if
  // the create call fails, and plex.tv returns 422 on create-when-already-
  // shared. Only when the share lookup or the update fails do we fall back to
  // the legacy remove-then-create path.
  private async applyShare(clients: PlexClients, userId: number, settings: SyncUserSettings): Promise<void> {
    const machineId = await clients.pms.getMachineIdentifier()
    const sectionIds = await this.resolveSectionIds(clients, settings.libraryAccess)
    const shareSettings: PlexShareSettings = {
      allowTuners: settings.enableLiveTvAccess,
      allowSync: settings.enableSync ?? (await getSetting(SETTINGS.PLEX_DEFAULT_SYNC)) !== 'false'
    }

    const existingShareId = await this.findExistingShare(clients, machineId, userId)
    if (existingShareId !== null) {
      try {
        await clients.tv.updateShare(existingShareId, machineId, sectionIds, shareSettings)
        return
      } catch (error) {
        log.debug(`could not update Plex share ${existingShareId} for user ${userId}, re-creating:`, error)
      }
    }

    await this.recreateShare(clients, machineId, userId, sectionIds, shareSettings)
  }

  // Best-effort share lookup. Failing to list shares is not fatal - the
  // remove+create fallback still works.
  private async findExistingShare(clients: PlexClients, machineId: string, userId: number): Promise<number | null> {
    try {
      return await clients.tv.findShareId(machineId, userId)
    } catch (error) {
      log.debug(`could not list plex.tv shares for user ${userId} (falling back to remove+create):`, error)
      return null
    }
  }

  private async recreateShare(
    clients: PlexClients,
    machineId: string,
    userId: number,
    sectionIds: number[],
    settings: PlexShareSettings
  ): Promise<void> {
    try {
      await clients.tv.removeShare(userId)
    } catch (error) {
      log.debug(`no existing share for Plex user ${userId} before apply (ok):`, error)
    }

    try {
      await clients.tv.createShare(machineId, userId, sectionIds, settings)
    } catch (error) {
      // The previous share is already gone: this user has no library access
      // right now, so make the consequence explicit in the logs.
      log.error(`failed to create Plex share for user ${userId} after removing the previous one:`, error)
      throw error
    }
  }

  private async resolveSectionIds(clients: PlexClients, libraryAccess: string[] | 'all'): Promise<number[]> {
    if (libraryAccess === 'all') {
      const sections = await clients.pms.getSections()
      return sections.map((section) => Number(section.key)).filter((id) => Number.isFinite(id))
    }
    return libraryAccess.map((value) => Number(value)).filter((id) => Number.isFinite(id))
  }

  // Server-wide defaults used when re-granting access on enable (the caller has
  // no per-user settings in scope). Shares the builder with the orchestrator so
  // the two definitions cannot drift apart.
  private async defaultShareSettings(): Promise<SyncUserSettings> {
    return buildPlexSyncSettings()
  }
}
