import { downloads, users } from '#server/database/schema'
import { eq, and, desc, count } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'
import { useDbAsync, dbGet, dbAll } from '#server/utils/db'
import { syncTorrentStatus, notifyJellyfinIfNeeded } from '#server/utils/torrents/torrent-sync'

type DownloadRow = InferSelectModel<typeof downloads> & { username?: string }

const DOWNLOAD_STATUS_VALUES = ['pending', 'downloading', 'completed', 'failed', 'paused', 'removed'] as const
type SupportedStatus = (typeof DOWNLOAD_STATUS_VALUES)[number]

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

  const status =
    typeof rawStatus === 'string' && DOWNLOAD_STATUS_VALUES.includes(rawStatus as SupportedStatus)
      ? (rawStatus as SupportedStatus)
      : undefined

  // Sync before reading - data will be fresh on this request
  await syncTorrentStatus().catch(() => {})
  void notifyJellyfinIfNeeded().catch(() => {})

  const isAdmin = session.user.role === 'admin'

  const whereClause = (() => {
    if (isAdmin) return undefined
    if (status !== undefined) return and(eq(downloads.userId, session.user.id), eq(downloads.status, status))
    return eq(downloads.userId, session.user.id)
  })()

  const countResult = await dbGet(db.select({ count: count() }).from(downloads).where(whereClause))

  const total = countResult?.count ?? 0

  const results: DownloadRow[] = await dbAll(
    db.select().from(downloads).where(whereClause).orderBy(desc(downloads.createdAt)).limit(limit).offset(offset)
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
