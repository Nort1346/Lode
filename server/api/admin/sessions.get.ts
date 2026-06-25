import { sessions, users } from '#server/database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()

  const allSessions = db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
      deviceName: sessions.deviceName,
      createdAt: sessions.createdAt,
      lastActiveAt: sessions.lastActiveAt,
      username: users.username,
      role: users.role
    })
    .from(sessions)
    .leftJoin(users, eq(sessions.userId, users.id))
    .all()

  return allSessions
})
