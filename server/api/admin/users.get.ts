import { users, syncProviders, syncUserSettings } from '#server/database/schema'
import { eq, and } from 'drizzle-orm'
import { useDbAsync, dbGet, dbAll } from '#server/utils/db'
import { parseStoredLibraryAccess } from '#server/utils/sync/provider-settings'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = await useDbAsync()
  const allUsers = await dbAll(db.select().from(users))

  return Promise.all(
    allUsers.map(async (u) => {
      const providerRows = await dbAll(db.select().from(syncProviders).where(eq(syncProviders.userId, u.id)))

      const settingsRow = await dbGet(
        db
          .select()
          .from(syncUserSettings)
          .where(and(eq(syncUserSettings.userId, u.id), eq(syncUserSettings.providerName, 'jellyfin')))
      )

      const plexSettingsRow = await dbGet(
        db
          .select()
          .from(syncUserSettings)
          .where(and(eq(syncUserSettings.userId, u.id), eq(syncUserSettings.providerName, 'plex')))
      )

      return {
        id: u.id,
        username: u.username,
        role: u.role,
        isActive: u.isActive,
        dailyDownloadLimit: u.dailyDownloadLimit,
        activeTorrentLimit: u.activeTorrentLimit,
        maxTorrentSizeGb: u.maxTorrentSizeGb,
        privateTrackerLimit: u.privateTrackerLimit,
        downloadsToday: u.downloadsToday,
        createdAt: u.createdAt,
        discordId: u.discordId,
        canSubmit: u.canSubmit,
        mustChangePassword: u.mustChangePassword,
        maxSessions: u.maxSessions,
        avatarUrl: u.avatarUrl,
        expiresAt: u.expiresAt,
        syncStatus: u.syncStatus,
        syncProviders: providerRows.map((p) => ({
          providerName: p.providerName,
          providerUserId: p.providerUserId,
          syncStatus: p.syncStatus,
          lastSyncError: p.lastSyncError
        })),
        // Parsed leniently: one corrupt row must not break the whole user list.
        jellyfinLibraryAccess: parseStoredLibraryAccess(settingsRow?.libraryAccess),
        jellyfinEnableVideoTranscoding: settingsRow?.enableVideoTranscoding ?? true,
        jellyfinEnableAudioTranscoding: settingsRow?.enableAudioTranscoding ?? true,
        jellyfinEnableRemuxing: settingsRow?.enableRemuxing ?? true,
        jellyfinEnableLiveTvAccess: settingsRow?.enableLiveTvAccess ?? true,
        jellyfinEnableLiveTvManagement: settingsRow?.enableLiveTvManagement ?? false,
        jellyfinMaxActiveSessions: settingsRow?.maxActiveSessions ?? 0,
        plexLibraryAccess: parseStoredLibraryAccess(plexSettingsRow?.libraryAccess),
        plexEnableLiveTvAccess: plexSettingsRow?.enableLiveTvAccess ?? true,
        plexEnableSync: plexSettingsRow?.enableSync ?? true
      }
    })
  )
})
