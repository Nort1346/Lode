import { customTrackers } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { encryptAES } from '#server/utils/crypto'
import type { CreateTrackerBody } from '#server/types/tracker'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const body = await readBody<CreateTrackerBody>(event)

  const indexerName = body.indexerName?.trim()
  if (!indexerName) {
    throw createError({ statusCode: 400, statusMessage: 'indexerName is required' })
  }

  const trackerType = body.trackerType === 'guid' ? 'guid' : 'counting'

  const hasCookie = (body.cookie?.trim().length ?? 0) > 0
  const hasLogin =
    (body.loginUrl?.trim().length ?? 0) > 0 &&
    (body.loginUsername?.trim().length ?? 0) > 0 &&
    (body.loginPassword?.trim().length ?? 0) > 0

  if (trackerType === 'guid' && hasCookie === hasLogin) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Provide either cookie OR login credentials (loginUrl + loginUsername + loginPassword), not both'
    })
  }

  const db = useDb()
  const existing = db.select().from(customTrackers).where(eq(customTrackers.indexerName, indexerName)).get()

  if (existing !== undefined) {
    throw createError({ statusCode: 409, statusMessage: `Tracker "${indexerName}" already exists` })
  }

  const id = randomUUID()
  const cookieValue = trackerType === 'guid' && hasCookie ? (body.cookie?.trim() ?? '') : ''
  const loginUrlValue = trackerType === 'guid' && hasLogin ? (body.loginUrl?.trim() ?? '') : null
  const loginUsernameValue = trackerType === 'guid' && hasLogin ? (body.loginUsername?.trim() ?? '') : null
  const loginPasswordValue = trackerType === 'guid' && hasLogin ? encryptAES(body.loginPassword?.trim() ?? '') : null

  db.insert(customTrackers)
    .values({
      id,
      indexerName,
      trackerType,
      cookie: cookieValue,
      loginUrl: loginUrlValue,
      loginUsername: loginUsernameValue,
      loginPassword: loginPasswordValue,
      enabled: true,
      createdAt: new Date().toISOString()
    })
    .run()

  logActivity(event, {
    action: 'tracker_add',
    userId: user.id,
    username: user.username,
    details: JSON.stringify({ indexerName, trackerType, method: hasLogin ? 'login' : hasCookie ? 'cookie' : 'none' })
  })

  return { success: true, id }
})
