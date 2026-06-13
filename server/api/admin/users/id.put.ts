import bcrypt from 'bcrypt'
import { users } from '../../../database/schema'
import { eq } from 'drizzle-orm'

interface UpdateUserBody {
  username?: string
  password?: string
  role?: string
  isActive?: boolean
  dailyDownloadLimit?: number
  activeTorrentLimit?: number
  maxTorrentSizeGb?: number
  downloadsToday?: number
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

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

  const updates: Record<string, unknown> = {}
  if (body.username !== undefined) updates.username = body.username
  if (body.password !== undefined) updates.password = await bcrypt.hash(body.password, 12)
  if (body.role !== undefined) updates.role = body.role
  if (body.isActive !== undefined) updates.isActive = body.isActive
  if (body.dailyDownloadLimit !== undefined) updates.dailyDownloadLimit = body.dailyDownloadLimit
  if (body.activeTorrentLimit !== undefined) updates.activeTorrentLimit = body.activeTorrentLimit
  if (body.maxTorrentSizeGb !== undefined) updates.maxTorrentSizeGb = body.maxTorrentSizeGb
  if (body.downloadsToday !== undefined) updates.downloadsToday = body.downloadsToday

  if (Object.keys(updates).length > 0) {
    db.update(users).set(updates).where(eq(users.id, id)).run()
  }

  return { success: true }
})
