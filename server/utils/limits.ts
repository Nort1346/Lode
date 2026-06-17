import { downloads } from '#server/database/schema'
import { and, eq } from 'drizzle-orm'

export interface DailyLimitResult {
  reached: boolean
  activeCount: number
  todayCount: number
  limit: number
}

export function checkDailyLimit(session: {
  user?: { id: string; role: string; dailyDownloadLimit: number }
}): DailyLimitResult {
  if (session.user === undefined || session.user === null) {
    return { reached: false, activeCount: 0, todayCount: 0, limit: 0 }
  }

  if (session.user.role === 'admin') {
    return { reached: false, activeCount: 0, todayCount: 0, limit: session.user.dailyDownloadLimit }
  }

  const db = useDb()
  const userId = session.user.id
  const limit = session.user.dailyDownloadLimit

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
