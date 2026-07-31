import { hash } from '@node-rs/bcrypt'
import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { syncNewUser, getDefaultSyncSettings } from '#server/utils/sync'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'
import type { CreateUserBody } from '#server/types/admin'

import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<CreateUserBody>(event)
  const username = body.username?.trim() ?? ''
  const password = body.password?.trim() ?? ''
  const {
    role,
    dailyDownloadLimit,
    activeTorrentLimit,
    maxTorrentSizeGb,
    privateTrackerLimit,
    discordId,
    canSubmit,
    maxSessions
  } = body

  const defaultDaily = Number((await getSetting(SETTINGS.USER_DEFAULT_DAILY_DOWNLOAD_LIMIT)) ?? '5') || 5
  const defaultActive = Number((await getSetting(SETTINGS.USER_DEFAULT_ACTIVE_TORRENT_LIMIT)) ?? '3') || 3
  const defaultMaxSize = Number((await getSetting(SETTINGS.USER_DEFAULT_MAX_TORRENT_SIZE_GB)) ?? '20') || 20
  const defaultPrivate = Number((await getSetting(SETTINGS.USER_DEFAULT_PRIVATE_TRACKER_LIMIT)) ?? '5') || 5
  const defaultMaxSessions = Number((await getSetting(SETTINGS.USER_DEFAULT_MAX_SESSIONS)) ?? '0') || 0
  const defaultCanSubmit = (await getSetting(SETTINGS.USER_DEFAULT_CAN_SUBMIT)) === 'true'

  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password are required' })
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 8 characters' })
  }

  const db = await useDbAsync()
  const existing = await dbGet(db.select().from(users).where(eq(users.username, username)))
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Username already exists' })
  }

  const id = randomUUID()
  const syncSettings = await getDefaultSyncSettings({
    libraryAccess: body.jellyfinLibraryAccess,
    enableVideoTranscoding: body.jellyfinEnableVideoTranscoding,
    enableAudioTranscoding: body.jellyfinEnableAudioTranscoding,
    enableRemuxing: body.jellyfinEnableRemuxing,
    enableLiveTvAccess: body.jellyfinEnableLiveTvAccess,
    enableLiveTvManagement: body.jellyfinEnableLiveTvManagement,
    maxActiveSessions: body.jellyfinMaxActiveSessions
  })

  const hashedPassword = await hash(password, 12)

  await dbRun(
    db.insert(users).values({
      id,
      username,
      password: hashedPassword,
      role: role === 'user' || role === 'admin' ? role : 'user',
      dailyDownloadLimit: dailyDownloadLimit ?? defaultDaily,
      activeTorrentLimit: activeTorrentLimit ?? defaultActive,
      maxTorrentSizeGb: maxTorrentSizeGb ?? defaultMaxSize,
      privateTrackerLimit: privateTrackerLimit ?? defaultPrivate,
      isActive: true,
      downloadsToday: 0,
      createdAt: new Date().toISOString(),
      discordId: discordId ?? null,
      canSubmit: canSubmit ?? defaultCanSubmit,
      maxSessions: maxSessions ?? defaultMaxSessions,
      expiresAt: body.expiresAt ?? null,
      syncStatus: 'pending'
    })
  )

  const syncStatus = await syncNewUser(id, { username, password }, syncSettings)

  if (syncStatus === 'synced') {
    await dbRun(db.update(users).set({ syncStatus: 'synced' }).where(eq(users.id, id)))
  } else {
    await dbRun(db.update(users).set({ syncStatus: 'failed' }).where(eq(users.id, id)))
  }

  return { success: true, id }
})
