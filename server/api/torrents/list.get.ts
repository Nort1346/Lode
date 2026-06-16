import { downloads, users } from '../../database/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'
import { syncTorrentStatus, notifyJellyfinIfNeeded } from '../../utils/torrent-sync'

type DownloadRow = InferSelectModel<typeof downloads> & { username?: string }

const DOWNLOAD_STATUS_VALUES = ['pending', 'downloading', 'completed', 'failed', 'paused', 'removed'] as const
type SupportedStatus = (typeof DOWNLOAD_STATUS_VALUES)[number]

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const db = useDb()
  const query = getQuery(event)
  const rawStatus = query.status
  const status =
    typeof rawStatus === 'string' && DOWNLOAD_STATUS_VALUES.includes(rawStatus as SupportedStatus)
      ? (rawStatus as SupportedStatus)
      : undefined

  // Trigger sync in background (non-blocking) — data will be fresh on next request
  void syncTorrentStatus().catch(() => {})
  void notifyJellyfinIfNeeded().catch(() => {})

  let results: DownloadRow[]
  if (status !== undefined) {
    results = db
      .select()
      .from(downloads)
      .where(and(eq(downloads.userId, session.user.id), eq(downloads.status, status)))
      .orderBy(desc(downloads.createdAt))
      .all()
  } else {
    results = db
      .select()
      .from(downloads)
      .where(eq(downloads.userId, session.user.id))
      .orderBy(desc(downloads.createdAt))
      .all()
  }

  const allUsers = db.select().from(users).all()
  const userMap = new Map(allUsers.map((u) => [u.id, u.username]))
  userMap.set(session.user.id, session.user.username)

  if (session.user.role === 'admin') {
    results = db.select().from(downloads).orderBy(desc(downloads.createdAt)).all()

    for (const dl of results) {
      dl.username = userMap.get(dl.userId) ?? 'unknown'
    }
  }

  return { downloads: results }
})
