import { downloads } from '#server/database/schema'
import { and, eq } from 'drizzle-orm'
import { getFreshUser } from '#server/utils/user'
import type { DailyLimitResult } from '#server/types/limits'

export function checkDailyLimit(userId: string): DailyLimitResult {
  const freshUser = getFreshUser(userId)
  if (freshUser === undefined) {
    return { reached: false, activeCount: 0, todayCount: 0, limit: 0 }
  }

  if (freshUser.role === 'admin') {
    return { reached: false, activeCount: 0, todayCount: 0, limit: freshUser.dailyDownloadLimit }
  }

  const db = useDb()
  const limit = freshUser.dailyDownloadLimit

  const activeCount = db
    .select()
    .from(downloads)
    .where(and(eq(downloads.userId, userId), eq(downloads.status, 'downloading')))
    .all().length

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayCount = db
    .select()
    .from(downloads)
    .where(eq(downloads.userId, userId))
    .all()
    .filter((d) => new Date(d.createdAt) >= todayStart && d.status !== 'failed' && d.status !== 'removed').length

  return {
    reached: activeCount + todayCount >= limit,
    activeCount,
    todayCount,
    limit
  }
}
