import { hash } from '@node-rs/bcrypt'
import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { syncNewUser, getDefaultSyncSettings } from '#server/utils/sync'
import type { CreateUserBody } from '#server/types/admin'

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

  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password are required' })
  }

  const db = useDb()
  const existing = db.select().from(users).where(eq(users.username, username)).get()
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

  db.insert(users)
    .values({
      id,
      username,
      password: hashedPassword,
      role: role === 'user' || role === 'admin' ? role : 'user',
      dailyDownloadLimit: dailyDownloadLimit ?? 5,
      activeTorrentLimit: activeTorrentLimit ?? 3,
      maxTorrentSizeGb: maxTorrentSizeGb ?? 20,
      privateTrackerLimit: privateTrackerLimit ?? 5,
      isActive: true,
      downloadsToday: 0,
      createdAt: new Date().toISOString(),
      discordId: discordId ?? null,
      canSubmit: canSubmit ?? false,
      maxSessions: maxSessions ?? 0,
      expiresAt: body.expiresAt ?? null,
      syncStatus: 'pending'
    })
    .run()

  const syncStatus = await syncNewUser(id, { username, password }, syncSettings)

  if (syncStatus === 'synced') {
    db.update(users).set({ syncStatus: 'synced' }).where(eq(users.id, id)).run()
  } else {
    db.update(users).set({ syncStatus: 'failed' }).where(eq(users.id, id)).run()
  }

  return { success: true, id }
})
