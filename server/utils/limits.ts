import { getReposAsync } from '#server/repositories'
import { getFreshUser } from '#server/utils/user'
import type { DailyLimitResult } from '#server/types/limits'
import type { Download } from '#server/types/entities'

const EXCLUDED_DAILY_STATUSES: Download['status'][] = ['failed', 'removed']

export async function checkDailyLimit(userId: string): Promise<DailyLimitResult> {
  const freshUser = await getFreshUser(userId)
  if (freshUser === undefined) {
    return { reached: false, activeCount: 0, todayCount: 0, limit: 0 }
  }

  if (freshUser.role === 'admin') {
    return { reached: false, activeCount: 0, todayCount: 0, limit: freshUser.dailyDownloadLimit }
  }

  const repos = await getReposAsync()
  const limit = freshUser.dailyDownloadLimit

  const activeCount = await repos.downloads.countFiltered({ userId, statuses: ['downloading', 'paused'] })

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCount = await repos.downloads.countByUserSince(userId, todayStart.toISOString(), EXCLUDED_DAILY_STATUSES)

  return {
    reached: todayCount >= limit,
    activeCount,
    todayCount,
    limit
  }
}
