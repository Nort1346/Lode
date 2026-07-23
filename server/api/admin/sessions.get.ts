import { sessions, users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbAll } from '#server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = await useDbAsync()

  const allSessions = await dbAll(
    db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        ip: sessions.ip,
        userAgent: sessions.userAgent,
        deviceName: sessions.deviceName,
        createdAt: sessions.createdAt,
        lastActiveAt: sessions.lastActiveAt,
        username: users.username,
        role: users.role,
        avatarUrl: users.avatarUrl
      })
      .from(sessions)
      .leftJoin(users, eq(sessions.userId, users.id))
  )

  return allSessions
})
