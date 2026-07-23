import { decryptAES } from '#server/utils/crypto'
import { customTrackers } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { performTrackerLogin } from '#server/utils/tracker-auth'
import { useDbAsync, dbGet } from '#server/utils/db'
import type { TestLoginBody } from '#server/types/tracker'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<TestLoginBody>(event)

  const trackerId = getRouterParam(event, 'id')
  let loginUrl = body.loginUrl?.trim()
  let loginUsername = body.loginUsername?.trim()
  let loginPassword = body.loginPassword?.trim()

  if (
    trackerId !== null &&
    trackerId !== undefined &&
    trackerId !== '' &&
    (loginUrl === undefined || loginUrl.length === 0)
  ) {
    const db = await useDbAsync()
    const tracker = await dbGet(db.select().from(customTrackers).where(eq(customTrackers.id, trackerId)))
    if (tracker === undefined) {
      throw createError({ statusCode: 404, statusMessage: 'Tracker not found' })
    }
    loginUrl = tracker.loginUrl ?? undefined
    loginUsername = tracker.loginUsername ?? undefined
    if (tracker.loginPassword !== null && tracker.loginPassword.length > 0) {
      loginPassword = decryptAES(tracker.loginPassword)
    }
  }

  if (
    loginUrl === undefined ||
    loginUrl.length === 0 ||
    loginUsername === undefined ||
    loginUsername.length === 0 ||
    loginPassword === undefined ||
    loginPassword.length === 0
  ) {
    throw createError({ statusCode: 400, statusMessage: 'loginUrl, loginUsername, and loginPassword are required' })
  }

  try {
    const cookie = await performTrackerLogin(loginUrl, loginUsername, loginPassword)
    return {
      success: true,
      message: `Login OK - ${cookie.split(';').length} session cookies received`,
      cookiePreview: cookie.substring(0, 40) + '...'
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: msg, cookiePreview: '' }
  }
})
