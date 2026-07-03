import { randomUUID } from 'node:crypto'
import { compare } from '@node-rs/bcrypt'
import { sessions, users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { syncUserDisable } from '#server/utils/sync'

interface LoginBody {
  username: string
  password: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LoginBody>(event)
  const username = body.username?.trim() ?? ''
  const password = body.password?.trim() ?? ''

  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password are required' })
  }

  const db = useDb()
  const user = db.select().from(users).where(eq(users.username, username)).get()

  if (!user) {
    logActivity(event, { action: 'login_failed', username, details: 'User not found' })
    await recordLoginAttempt(event, { username, success: false })
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  if (user.expiresAt !== null && user.expiresAt !== '' && new Date(user.expiresAt) <= new Date()) {
    db.update(users).set({ isActive: false }).where(eq(users.id, user.id)).run()
    syncUserDisable(user.id).catch(() => {})
    logActivity(event, {
      action: 'login_failed',
      userId: user.id,
      username: user.username,
      details: 'Account has expired'
    })
    await recordLoginAttempt(event, { username: user.username, success: false })
    throw createError({ statusCode: 403, statusMessage: 'Account has expired' })
  }

  if (!user.isActive) {
    logActivity(event, {
      action: 'login_failed',
      userId: user.id,
      username: user.username,
      details: 'Account deactivated'
    })
    await recordLoginAttempt(event, { username: user.username, success: false })
    throw createError({ statusCode: 403, statusMessage: 'Account is deactivated' })
  }

  const valid = await compare(password, user.password)
  if (!valid) {
    logActivity(event, { action: 'login_failed', userId: user.id, username: user.username, details: 'Wrong password' })
    await recordLoginAttempt(event, { username: user.username, success: false })
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  await recordLoginAttempt(event, { username: user.username, success: true })

  const sessionId = randomUUID()
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? null
  const ua = getRequestHeader(event, 'user-agent') ?? null
  const now = new Date().toISOString()
  const deviceName = parseDeviceName(ua)

  db.insert(sessions)
    .values({
      id: sessionId,
      userId: user.id,
      ip,
      userAgent: ua,
      deviceName,
      createdAt: now,
      lastActiveAt: now
    })
    .run()

  await enforceMaxSessions(user.id, user.maxSessions)

  await setUserSession(event, {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      dailyDownloadLimit: user.dailyDownloadLimit,
      activeTorrentLimit: user.activeTorrentLimit,
      maxTorrentSizeGb: user.maxTorrentSizeGb,
      privateTrackerLimit: user.privateTrackerLimit,
      downloadsToday: user.downloadsToday
    },
    sessionId
  })

  logActivity(event, { action: 'login', userId: user.id, username: user.username })

  return { success: true, user: { id: user.id, username: user.username, role: user.role } }
})
