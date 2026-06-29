import bcrypt from 'bcrypt'
import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { syncUserCreate, getDefaultSyncSettings, upsertSyncUserSettings } from '#server/utils/sync'

interface CreateUserBody {
  username: string
  password: string
  role?: string
  dailyDownloadLimit?: number
  activeTorrentLimit?: number
  maxTorrentSizeGb?: number
  privateTrackerLimit?: number
  canSubmit?: boolean
  maxSessions?: number
  discordId?: string | null
  jellyfinLibraryAccess?: string[] | 'all'
  jellyfinEnableVideoTranscoding?: boolean
  jellyfinEnableAudioTranscoding?: boolean
  jellyfinEnableRemuxing?: boolean
  jellyfinEnableLiveTvAccess?: boolean
  jellyfinEnableLiveTvManagement?: boolean
  jellyfinMaxActiveSessions?: number
}

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
  const syncSettings = getDefaultSyncSettings({
    libraryAccess: body.jellyfinLibraryAccess,
    enableVideoTranscoding: body.jellyfinEnableVideoTranscoding,
    enableAudioTranscoding: body.jellyfinEnableAudioTranscoding,
    enableRemuxing: body.jellyfinEnableRemuxing,
    enableLiveTvAccess: body.jellyfinEnableLiveTvAccess,
    enableLiveTvManagement: body.jellyfinEnableLiveTvManagement,
    maxActiveSessions: body.jellyfinMaxActiveSessions
  })

  try {
    await syncUserCreate(id, { username, password }, syncSettings)
  } catch (error) {
    console.error('[User] Jellyfin sync failed, creating user in StreamHub only:', error)
  }

  upsertSyncUserSettings(id, 'jellyfin', syncSettings)

  const hashedPassword = await bcrypt.hash(password, 12)

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
      syncStatus: 'synced'
    })
    .run()

  return { success: true, id }
})
