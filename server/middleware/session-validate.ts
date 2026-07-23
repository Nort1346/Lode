const lastTouchMap = new Map<string, number>()
const TOUCH_INTERVAL_MS = 60_000

export default defineEventHandler(async (event) => {
  const path = event.path ?? ''
  if (!path.startsWith('/api/') || path.startsWith('/api/_auth/')) return

  const session = await getUserSession(event).catch(() => null)

  if (session?.sessionId === null || session?.sessionId === undefined) return

  const result = await validateSession(session.sessionId)

  if (!result.valid) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Session expired' })
  }

  if (result.userActive === false) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Account disabled' })
  }

  const now = Date.now()
  const lastTouch = lastTouchMap.get(session.sessionId) ?? 0
  if (now - lastTouch >= TOUCH_INTERVAL_MS) {
    lastTouchMap.set(session.sessionId, now)
    await touchSession(session.sessionId)
  }
})
