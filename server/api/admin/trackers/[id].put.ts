import { customTrackers } from '#server/database/schema'
import { eq, and, ne } from 'drizzle-orm'
import { encryptAES } from '#server/utils/crypto'

interface UpdateTrackerBody {
  indexerName?: string
  trackerType?: 'guid' | 'counting'
  cookie?: string
  loginUrl?: string
  loginUsername?: string
  loginPassword?: string
  enabled?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (id === null || id === undefined || id === '') {
    throw createError({ statusCode: 400, statusMessage: 'Tracker ID is required' })
  }

  const body = await readBody<UpdateTrackerBody>(event)
  const db = useDb()

  const existing = db.select().from(customTrackers).where(eq(customTrackers.id, id)).get()
  if (existing === undefined) {
    throw createError({ statusCode: 404, statusMessage: 'Tracker not found' })
  }

  const updates: Record<string, unknown> = {}

  if (body.trackerType !== undefined) {
    updates.trackerType = body.trackerType === 'guid' ? 'guid' : 'counting'
  }

  if (body.indexerName !== undefined) {
    const indexerName = body.indexerName.trim()
    if (!indexerName) {
      throw createError({ statusCode: 400, statusMessage: 'indexerName cannot be empty' })
    }
    const nameTaken = db
      .select()
      .from(customTrackers)
      .where(and(eq(customTrackers.indexerName, indexerName), ne(customTrackers.id, id)))
      .get()
    if (nameTaken !== undefined) {
      throw createError({ statusCode: 409, statusMessage: `Tracker "${indexerName}" already exists` })
    }
    updates.indexerName = indexerName
  }

  const effectiveType = (body.trackerType ?? existing.trackerType) as string

  if (effectiveType === 'guid') {
    const hasCookie = (body.cookie?.trim().length ?? 0) > 0
    const hasLogin =
      (body.loginUrl?.trim().length ?? 0) > 0 &&
      (body.loginUsername?.trim().length ?? 0) > 0 &&
      (body.loginPassword?.trim().length ?? 0) > 0

    if (hasCookie && hasLogin) {
      throw createError({ statusCode: 400, statusMessage: 'Provide either cookie OR login credentials, not both' })
    }

    if (hasCookie) {
      updates.cookie = body.cookie?.trim() ?? ''
      updates.loginUrl = null
      updates.loginUsername = null
      updates.loginPassword = null
    } else if (hasLogin) {
      updates.cookie = ''
      updates.loginUrl = body.loginUrl?.trim() ?? ''
      updates.loginUsername = body.loginUsername?.trim() ?? ''
      updates.loginPassword = encryptAES(body.loginPassword?.trim() ?? '')
    }
  } else {
    updates.cookie = ''
    updates.loginUrl = null
    updates.loginUsername = null
    updates.loginPassword = null
  }

  if (body.enabled !== undefined) {
    updates.enabled = body.enabled
  }

  if (Object.keys(updates).length === 0) {
    return { success: true }
  }

  db.update(customTrackers).set(updates).where(eq(customTrackers.id, id)).run()

  logActivity(event, {
    action: 'tracker_update',
    userId: user.id,
    username: user.username,
    details: JSON.stringify({ id, ...updates })
  })

  return { success: true }
})
