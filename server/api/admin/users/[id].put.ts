import { hash } from '@node-rs/bcrypt'
import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import {
  syncUserUpdate,
  syncUserDisable,
  syncUserEnable,
  getDefaultSyncSettings,
  upsertSyncUserSettings
} from '#server/utils/sync'

interface UpdateUserBody {
  username?: string
  password?: string
  role?: string
  isActive?: boolean
  dailyDownloadLimit?: number
  activeTorrentLimit?: number
  maxTorrentSizeGb?: number
  privateTrackerLimit?: number
  downloadsToday?: number
  discordId?: string | null
  canSubmit?: boolean
  maxSessions?: number
  jellyfinLibraryAccess?: string[] | 'all'
  jellyfinEnableVideoTranscoding?: boolean
  jellyfinEnableAudioTranscoding?: boolean
  jellyfinEnableRemuxing?: boolean
  jellyfinEnableLiveTvAccess?: boolean
  jellyfinEnableLiveTvManagement?: boolean
  jellyfinMaxActiveSessions?: number
  expiresAt?: string | null
}

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (id === null || id === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  const body = await readBody<UpdateUserBody>(event)
  const db = useDb()

  const user = db.select().from(users).where(eq(users.id, id)).get()
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const changedFields: string[] = []
  const updates: Record<string, unknown> = {}

  if (body.username !== undefined) {
    updates.username = body.username.trim()
    changedFields.push('username')
  }

  let plainPassword: string | null = null
  if (body.password !== undefined && body.password.trim()) {
    plainPassword = body.password.trim()
    updates.password = await hash(plainPassword, 12)
    changedFields.push('password')
  }

  if (body.role !== undefined) {
    updates.role = body.role
    changedFields.push('role')
  }
  if (body.isActive !== undefined) {
    updates.isActive = body.isActive
    changedFields.push('isActive')
  }
  if (body.dailyDownloadLimit !== undefined) {
    updates.dailyDownloadLimit = body.dailyDownloadLimit
    changedFields.push('dailyDownloadLimit')
  }
  if (body.activeTorrentLimit !== undefined) {
    updates.activeTorrentLimit = body.activeTorrentLimit
    changedFields.push('activeTorrentLimit')
  }
  if (body.maxTorrentSizeGb !== undefined) {
    updates.maxTorrentSizeGb = body.maxTorrentSizeGb
    changedFields.push('maxTorrentSizeGb')
  }
  if (body.privateTrackerLimit !== undefined) {
    updates.privateTrackerLimit = body.privateTrackerLimit
    changedFields.push('privateTrackerLimit')
  }
  if (body.downloadsToday !== undefined) {
    updates.downloadsToday = body.downloadsToday
    changedFields.push('downloadsToday')
  }
  if (body.discordId !== undefined) {
    updates.discordId = body.discordId === '' ? null : body.discordId
    changedFields.push('discordId')
  }
  if (body.canSubmit !== undefined) {
    updates.canSubmit = body.canSubmit
    changedFields.push('canSubmit')
  }
  if (body.maxSessions !== undefined) {
    updates.maxSessions = body.maxSessions
    changedFields.push('maxSessions')
  }
  if (body.expiresAt !== undefined) {
    updates.expiresAt = body.expiresAt
    changedFields.push('expiresAt')
  }

  if (Object.keys(updates).length > 0) {
    db.update(users).set(updates).where(eq(users.id, id)).run()
    logActivity(event, {
      action: 'user_update',
      userId: admin.id,
      username: admin.username,
      details: JSON.stringify({ targetUser: user.username, targetUserId: id, fields: changedFields })
    })
  }

  const syncSettings = getDefaultSyncSettings({
    libraryAccess: body.jellyfinLibraryAccess,
    enableVideoTranscoding: body.jellyfinEnableVideoTranscoding,
    enableAudioTranscoding: body.jellyfinEnableAudioTranscoding,
    enableRemuxing: body.jellyfinEnableRemuxing,
    enableLiveTvAccess: body.jellyfinEnableLiveTvAccess,
    enableLiveTvManagement: body.jellyfinEnableLiveTvManagement,
    maxActiveSessions: body.jellyfinMaxActiveSessions
  })

  upsertSyncUserSettings(id, 'jellyfin', syncSettings)

  if (body.isActive !== undefined && body.isActive !== user.isActive) {
    if (!body.isActive) {
      try {
        await syncUserDisable(id)
      } catch (e) {
        console.error('[User] Jellyfin disable failed:', e)
      }
    } else {
      db.update(users).set({ expiresAt: null }).where(eq(users.id, id)).run()
      try {
        await syncUserEnable(id)
      } catch (e) {
        console.error('[User] Jellyfin enable failed:', e)
      }
    }
  }

  if (changedFields.length > 0 || body.username !== undefined) {
    const jellyfinData = {
      username: body.username?.trim() ?? user.username,
      password: plainPassword ?? ''
    }
    try {
      await syncUserUpdate(id, jellyfinData, syncSettings)
    } catch (e) {
      console.error('[User] Jellyfin sync failed:', e)
    }
  }

  return { success: true }
})
