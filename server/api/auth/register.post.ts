import { hash } from '@node-rs/bcrypt'
import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { syncNewUser, getDefaultSyncSettings } from '#server/utils/sync'
import type { RegisterBody } from '#server/types/auth'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = await readBody<RegisterBody>(event)
  const username = body.username?.trim() ?? ''
  const password = body.password?.trim() ?? ''
  const { role, dailyDownloadLimit, activeTorrentLimit, maxTorrentSizeGb } = body

  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password are required' })
  }

  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can create users' })
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
      isActive: true,
      downloadsToday: 0,
      createdAt: new Date().toISOString(),
      syncStatus: 'pending'
    })
    .run()

  const syncStatus = await syncNewUser(id, { username, password }, syncSettings)

  if (syncStatus === 'synced') {
    db.update(users).set({ syncStatus: 'synced' }).where(eq(users.id, id)).run()
  } else {
    db.update(users).set({ syncStatus: 'failed' }).where(eq(users.id, id)).run()
  }

  logActivity(event, {
    action: 'register',
    userId: session.user.id,
    username: session.user.username,
    details: JSON.stringify({ newUsername: username, role: role ?? 'user' })
  })

  return { success: true, id }
})
