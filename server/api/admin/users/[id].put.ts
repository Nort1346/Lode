import bcrypt from 'bcrypt'
import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'

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
  if (body.password !== undefined) {
    updates.password = await bcrypt.hash(body.password.trim(), 12)
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

  if (Object.keys(updates).length > 0) {
    db.update(users).set(updates).where(eq(users.id, id)).run()
    logActivity(event, {
      action: 'user_update',
      userId: admin.id,
      username: admin.username,
      details: JSON.stringify({ targetUser: user.username, targetUserId: id, fields: changedFields })
    })
  }

  return { success: true }
})
