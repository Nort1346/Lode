import { syncProviders, syncUserSettings } from '#server/database/schema'
import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { SyncProvider, SyncUserData, SyncUserSettings, SyncStatus } from './types'
import { JellyfinSyncProvider } from './providers/jellyfin'
import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'
import { useDbAsync, dbGet, dbAll, dbRun } from '#server/utils/db'
import { createLogger } from '#server/utils/logger'

const log = createLogger('Sync')

const ALL_PROVIDERS: SyncProvider[] = [new JellyfinSyncProvider()]

async function defaultSyncSettingsOverrides(): Promise<{
  libraryAccess: string[] | 'all'
  enableVideoTranscoding: boolean
  enableAudioTranscoding: boolean
  enableRemuxing: boolean
  enableLiveTvAccess: boolean
  enableLiveTvManagement: boolean
  maxActiveSessions: number
}> {
  return {
    libraryAccess: JSON.parse((await getSetting(SETTINGS.JELLYFIN_DEFAULT_LIBRARY_ACCESS)) ?? '"all"') as
      string[] | 'all',
    enableVideoTranscoding: (await getSetting(SETTINGS.JELLYFIN_DEFAULT_VIDEO_TRANSCODING)) !== 'false',
    enableAudioTranscoding: (await getSetting(SETTINGS.JELLYFIN_DEFAULT_AUDIO_TRANSCODING)) !== 'false',
    enableRemuxing: (await getSetting(SETTINGS.JELLYFIN_DEFAULT_REMUXING)) !== 'false',
    enableLiveTvAccess: (await getSetting(SETTINGS.JELLYFIN_DEFAULT_LIVE_TV_ACCESS)) !== 'false',
    enableLiveTvManagement: (await getSetting(SETTINGS.JELLYFIN_DEFAULT_LIVE_TV_MANAGEMENT)) === 'true',
    maxActiveSessions: Number((await getSetting(SETTINGS.JELLYFIN_DEFAULT_MAX_ACTIVE_SESSIONS)) ?? '0')
  }
}

export async function getDefaultSyncSettings(overrides?: {
  libraryAccess?: string[] | 'all'
  enableVideoTranscoding?: boolean
  enableAudioTranscoding?: boolean
  enableRemuxing?: boolean
  enableLiveTvAccess?: boolean
  enableLiveTvManagement?: boolean
  maxActiveSessions?: number
}): Promise<SyncUserSettings> {
  const defaults = await defaultSyncSettingsOverrides()
  return {
    libraryAccess: overrides?.libraryAccess ?? defaults.libraryAccess,
    enableVideoTranscoding: overrides?.enableVideoTranscoding ?? defaults.enableVideoTranscoding,
    enableAudioTranscoding: overrides?.enableAudioTranscoding ?? defaults.enableAudioTranscoding,
    enableRemuxing: overrides?.enableRemuxing ?? defaults.enableRemuxing,
    enableLiveTvAccess: overrides?.enableLiveTvAccess ?? defaults.enableLiveTvAccess,
    enableLiveTvManagement: overrides?.enableLiveTvManagement ?? defaults.enableLiveTvManagement,
    maxActiveSessions: overrides?.maxActiveSessions ?? defaults.maxActiveSessions
  }
}

export async function getSyncUserSettings(userId: string, providerName: string): Promise<SyncUserSettings> {
  const db = await useDbAsync()
  const row = await dbGet(
    db
      .select()
      .from(syncUserSettings)
      .where(and(eq(syncUserSettings.userId, userId), eq(syncUserSettings.providerName, providerName)))
  )

  if (!row) {
    return await defaultSyncSettingsOverrides()
  }

  return {
    libraryAccess: JSON.parse(row.libraryAccess) as string[] | 'all',
    enableVideoTranscoding: row.enableVideoTranscoding,
    enableAudioTranscoding: row.enableAudioTranscoding,
    enableRemuxing: row.enableRemuxing,
    enableLiveTvAccess: row.enableLiveTvAccess,
    enableLiveTvManagement: row.enableLiveTvManagement,
    maxActiveSessions: row.maxActiveSessions
  }
}

export async function upsertSyncUserSettings(
  userId: string,
  providerName: string,
  settings: SyncUserSettings
): Promise<void> {
  const db = await useDbAsync()
  const existing = await dbGet(
    db
      .select()
      .from(syncUserSettings)
      .where(and(eq(syncUserSettings.userId, userId), eq(syncUserSettings.providerName, providerName)))
  )

  const now = new Date().toISOString()
  const libraryAccess = JSON.stringify(settings.libraryAccess)

  if (existing) {
    await dbRun(
      db
        .update(syncUserSettings)
        .set({
          libraryAccess,
          enableVideoTranscoding: settings.enableVideoTranscoding,
          enableAudioTranscoding: settings.enableAudioTranscoding,
          enableRemuxing: settings.enableRemuxing,
          enableLiveTvAccess: settings.enableLiveTvAccess,
          enableLiveTvManagement: settings.enableLiveTvManagement,
          maxActiveSessions: settings.maxActiveSessions,
          updatedAt: now
        })
        .where(eq(syncUserSettings.id, existing.id))
    )
  } else {
    await dbRun(
      db.insert(syncUserSettings).values({
        id: randomUUID(),
        userId,
        providerName,
        libraryAccess,
        enableVideoTranscoding: settings.enableVideoTranscoding,
        enableAudioTranscoding: settings.enableAudioTranscoding,
        enableRemuxing: settings.enableRemuxing,
        enableLiveTvAccess: settings.enableLiveTvAccess,
        enableLiveTvManagement: settings.enableLiveTvManagement,
        maxActiveSessions: settings.maxActiveSessions,
        createdAt: now,
        updatedAt: now
      })
    )
  }
}

export async function getActiveSyncProviders(): Promise<SyncProvider[]> {
  const active: SyncProvider[] = []
  for (const provider of ALL_PROVIDERS) {
    if (await provider.isEnabled()) {
      active.push(provider)
    }
  }
  return active
}

export async function getProviderUserId(userId: string, providerName: string): Promise<string | null> {
  const db = await useDbAsync()
  const row = await dbGet(
    db
      .select()
      .from(syncProviders)
      .where(and(eq(syncProviders.userId, userId), eq(syncProviders.providerName, providerName)))
  )
  return row?.providerUserId ?? null
}

export async function getUserSyncStatuses(userId: string): Promise<SyncStatus[]> {
  const db = await useDbAsync()
  const rows = await dbAll(db.select().from(syncProviders).where(eq(syncProviders.userId, userId)))

  return rows.map((row) => ({
    providerName: row.providerName,
    providerUserId: row.providerUserId,
    syncStatus: row.syncStatus as SyncStatus['syncStatus'],
    lastSyncError: row.lastSyncError
  }))
}

export async function syncNewUser(
  userId: string,
  data: SyncUserData,
  settings: SyncUserSettings
): Promise<'synced' | 'failed'> {
  try {
    await syncUserCreate(userId, data, settings)
    return 'synced'
  } catch (error) {
    log.error(`[Sync] create failed for user ${userId}:`, error)
    return 'failed'
  }
}

export async function syncUserCreate(userId: string, data: SyncUserData, settings: SyncUserSettings): Promise<void> {
  const providers = await getActiveSyncProviders()

  for (const provider of providers) {
    try {
      const existingMapping = await getProviderUserId(userId, provider.name)
      if (existingMapping !== null) {
        await syncUserUpdate(userId, data, settings)
        continue
      }

      let providerUserId = await provider.findUserByName(data.username)

      if (providerUserId === null) {
        if (!data.password) {
          log.warn(`[Sync] ${provider.name}: cannot create user "${data.username}" - no password provided, skipping`)
          continue
        }
        providerUserId = await provider.createUser(data)
        log.info(`[Sync] ${provider.name}: created user "${data.username}" (providerUserId: ${providerUserId})`)
      } else {
        log.info(`[Sync] ${provider.name}: found existing user "${data.username}" (providerUserId: ${providerUserId})`)
        if (data.password) {
          try {
            await provider.updateUserPassword(providerUserId, data.password)
          } catch (err) {
            log.error(`[Sync] ${provider.name}: failed to sync password for existing user "${data.username}":`, err)
          }
        }
      }

      const db = await useDbAsync()
      await dbRun(
        db.insert(syncProviders).values({
          id: randomUUID(),
          userId,
          providerName: provider.name,
          providerUserId,
          syncStatus: 'synced',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      )

      try {
        await provider.updateUserSettings(providerUserId, settings)
        await upsertSyncUserSettings(userId, provider.name, settings)
      } catch (settingsError) {
        const message = settingsError instanceof Error ? settingsError.message : String(settingsError)
        log.error(`[Sync] ${provider.name}.updateUserSettings failed for user ${userId}:`, message)
        await updateSyncStatus(userId, provider.name, 'failed', message)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`[Sync] ${provider.name}.syncUserCreate failed for user ${userId}:`, message)
      await updateSyncStatus(userId, provider.name, 'failed', message)
    }
  }
}

export async function syncUserUpdate(userId: string, data: SyncUserData, settings: SyncUserSettings): Promise<void> {
  const providers = await getActiveSyncProviders()

  for (const provider of providers) {
    let providerUserId = await getProviderUserId(userId, provider.name)

    if (providerUserId === null) {
      try {
        await syncUserCreate(userId, data, settings)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.error(`[Sync] ${provider.name}.retroactive create failed for user ${userId}:`, message)
      }
      providerUserId = await getProviderUserId(userId, provider.name)
      if (providerUserId === null) continue
    }

    try {
      if (data.password) {
        await provider.updateUserPassword(providerUserId, data.password)
      }
      await provider.updateUserSettings(providerUserId, settings)
      await updateSyncStatus(userId, provider.name, 'synced')
      await upsertSyncUserSettings(userId, provider.name, settings)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`[Sync] ${provider.name}.updateUser failed for user ${userId}:`, message)
      await updateSyncStatus(userId, provider.name, 'failed', message)
    }
  }
}

export async function syncUserDelete(userId: string): Promise<void> {
  const providers = await getActiveSyncProviders()

  for (const provider of providers) {
    const providerUserId = await getProviderUserId(userId, provider.name)
    if (providerUserId === null) {
      log.warn(`[Sync] ${provider.name}: no provider mapping for user ${userId}, skipping delete`)
      continue
    }

    try {
      await provider.deleteUser(providerUserId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`[Sync] ${provider.name}.deleteUser failed for user ${userId}:`, message)
    }
  }

  const db = await useDbAsync()
  await dbRun(db.delete(syncProviders).where(eq(syncProviders.userId, userId)))
  await dbRun(db.delete(syncUserSettings).where(eq(syncUserSettings.userId, userId)))
}

export async function syncUserDisable(userId: string): Promise<void> {
  const providers = await getActiveSyncProviders()

  for (const provider of providers) {
    const providerUserId = await getProviderUserId(userId, provider.name)
    if (providerUserId === null) {
      log.warn(`[Sync] ${provider.name}: no provider mapping for user ${userId}, skipping disable`)
      continue
    }

    try {
      await provider.disableUser(providerUserId)
      await updateSyncStatus(userId, provider.name, 'synced')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`[Sync] ${provider.name}.disableUser failed for user ${userId}:`, message)
      await updateSyncStatus(userId, provider.name, 'failed', message)
    }
  }
}

export async function syncUserEnable(userId: string): Promise<void> {
  const providers = await getActiveSyncProviders()

  for (const provider of providers) {
    const providerUserId = await getProviderUserId(userId, provider.name)
    if (providerUserId === null) {
      log.warn(`[Sync] ${provider.name}: no provider mapping for user ${userId}, skipping enable`)
      continue
    }

    try {
      await provider.enableUser(providerUserId)
      await updateSyncStatus(userId, provider.name, 'synced')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`[Sync] ${provider.name}.enableUser failed for user ${userId}:`, message)
      await updateSyncStatus(userId, provider.name, 'failed', message)
    }
  }
}

export async function syncAvatar(userId: string, imageBuffer: Buffer): Promise<void> {
  const providers = await getActiveSyncProviders()

  for (const provider of providers) {
    const providerUserId = await getProviderUserId(userId, provider.name)
    if (providerUserId === null) {
      log.warn(`[Sync] ${provider.name}: no provider mapping for user ${userId}, skipping avatar`)
      continue
    }

    try {
      await provider.setAvatar(providerUserId, imageBuffer)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`[Sync] ${provider.name}.setAvatar failed for user ${userId}:`, message)
    }
  }
}

export async function syncAvatarDelete(userId: string): Promise<void> {
  const providers = await getActiveSyncProviders()

  for (const provider of providers) {
    const providerUserId = await getProviderUserId(userId, provider.name)
    if (providerUserId === null) {
      log.warn(`[Sync] ${provider.name}: no provider mapping for user ${userId}, skipping avatar delete`)
      continue
    }

    try {
      await provider.deleteAvatar(providerUserId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error(`[Sync] ${provider.name}.deleteAvatar failed for user ${userId}:`, message)
    }
  }
}

async function updateSyncStatus(
  userId: string,
  providerName: string,
  status: 'synced' | 'pending' | 'failed',
  error?: string
): Promise<void> {
  const db = await useDbAsync()
  await dbRun(
    db
      .update(syncProviders)
      .set({
        syncStatus: status,
        lastSyncError: error ?? null,
        updatedAt: new Date().toISOString()
      })
      .where(and(eq(syncProviders.userId, userId), eq(syncProviders.providerName, providerName)))
  )
}
