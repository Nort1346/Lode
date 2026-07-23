import { getReposAsync } from '#server/repositories'
import { getFreshUser } from '#server/utils/user'
import type { DailyLimitResult } from '#server/types/limits'

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

  const activeDownloads = await repos.downloads.findActiveByUser(userId)
  const activeCount = activeDownloads.length

  const allDownloads = await repos.downloads.findByUser(userId)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayCount = allDownloads.filter(
    (d) => new Date(d.createdAt) >= todayStart && d.status !== 'failed' && d.status !== 'removed'
  ).length

  return {
    reached: activeCount + todayCount >= limit,
    activeCount,
    todayCount,
    limit
  }
}
