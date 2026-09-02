import { downloads, users } from '#server/database/schema'
import { eq, and, count, inArray } from 'drizzle-orm'
import { useDbAsync, dbGet, dbAll } from '#server/utils/db'
import { syncTorrentStatus, notifyJellyfinIfNeeded } from '#server/utils/torrents/torrent-sync'
import { downloadsOrderBy } from '#server/utils/torrents/download-order'
import type { DownloadRow, SupportedStatus } from '#server/types/torrent'
import { DOWNLOAD_STATUS_VALUES } from '#server/types/torrent'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const db = await useDbAsync()
  const query = getQuery(event)

  const rawPage = query.page
  const rawLimit = query.limit
  const rawStatus = query.status

  const page = typeof rawPage === 'string' ? Math.max(1, Number.parseInt(rawPage, 10) || 1) : 1
  const limit = typeof rawLimit === 'string' ? Math.min(100, Math.max(1, Number.parseInt(rawLimit, 10) || 10)) : 10
  const offset = (page - 1) * limit

  // Accepts a single status or a comma-separated list (e.g. "downloading,paused")
  const statuses: SupportedStatus[] = []
  if (typeof rawStatus === 'string') {
    for (const part of rawStatus
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')) {
      if (!DOWNLOAD_STATUS_VALUES.includes(part as SupportedStatus)) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid status filter' })
      }
      statuses.push(part as SupportedStatus)
    }
  }

  // Sync before reading - data will be fresh on this request
  await syncTorrentStatus().catch(() => {})
  void notifyJellyfinIfNeeded().catch(() => {})

  const isAdmin = session.user.role === 'admin'

  const whereClause = (() => {
    const userFilter = isAdmin ? undefined : eq(downloads.userId, session.user.id)
    if (statuses.length > 0) {
      const statusFilter =
        statuses.length === 1 && statuses[0] !== undefined
          ? eq(downloads.status, statuses[0])
          : inArray(downloads.status, statuses)
      return userFilter !== undefined ? and(userFilter, statusFilter) : statusFilter
    }
    return userFilter
  })()

  const countResult = await dbGet(db.select({ count: count() }).from(downloads).where(whereClause))

  const total = countResult?.count ?? 0

  const results: DownloadRow[] = await dbAll(
    db
      .select()
      .from(downloads)
      .where(whereClause)
      .orderBy(...downloadsOrderBy())
      .limit(limit)
      .offset(offset)
  )

  if (isAdmin) {
    const allUsers = await dbAll(db.select().from(users))
    const userMap = new Map(allUsers.map((u) => [u.id, u.username]))
    userMap.set(session.user.id, session.user.username)

    for (const dl of results) {
      dl.username = userMap.get(dl.userId) ?? 'unknown'
    }
  }

  return { downloads: results, total, page, limit }
})
