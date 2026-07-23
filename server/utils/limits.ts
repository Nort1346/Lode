import { downloads } from '#server/database/schema'
import { and, eq } from 'drizzle-orm'
import { getFreshUser } from '#server/utils/user'
import { useDbAsync, dbAll } from '#server/utils/db'
import type { DailyLimitResult } from '#server/types/limits'

export async function checkDailyLimit(userId: string): Promise<DailyLimitResult> {
  const freshUser = await getFreshUser(userId)
  if (freshUser === undefined) {
    return { reached: false, activeCount: 0, todayCount: 0, limit: 0 }
  }

  if (freshUser.role === 'admin') {
    return { reached: false, activeCount: 0, todayCount: 0, limit: freshUser.dailyDownloadLimit }
  }

  const db = await useDbAsync()
  const limit = freshUser.dailyDownloadLimit

  const activeCount = (
    await dbAll(
      db
        .select()
        .from(downloads)
        .where(and(eq(downloads.userId, userId), eq(downloads.status, 'downloading')))
    )
  ).length

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayCount = (await dbAll(db.select().from(downloads).where(eq(downloads.userId, userId)))).filter(
    (d) => new Date(d.createdAt) >= todayStart && d.status !== 'failed' && d.status !== 'removed'
  ).length

  return {
    reached: activeCount + todayCount >= limit,
    activeCount,
    todayCount,
    limit
  }
}
