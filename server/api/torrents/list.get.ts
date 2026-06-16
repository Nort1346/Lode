import { downloads, users } from '../../database/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

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
  const config = useRuntimeConfig()

  const savePathMap: Record<string, string> = {
    movies: config.savePathMovies,
    series: config.savePathSeries,
    games: config.savePathGames,
    books: config.savePathBooks,
    music: config.savePathMusic
  }

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

  const prepSpeedBytes = (config.jellyfinPrepSpeedMb ?? 8) * 1024 * 1024

  const activeIds = results.filter((d) => d.status === 'downloading' && d.torrentHash !== null).map((d) => d.id)

  if (activeIds.length > 0) {
    try {
      const qui = useQui()

      const quiTorrents = await qui.getAllTorrents()
      const completedStates = new Set(['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'])

      for (const dl of results) {
        if (dl.status !== 'downloading' || dl.torrentHash === null) continue

        let quiTorrent = quiTorrents.find((t) => t.hash === dl.torrentHash)

        if (quiTorrent === undefined && quiTorrents.length > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            `[list.get.ts] hash mismatch: db="${dl.torrentHash}" name="${dl.torrentName}" qui_count=${quiTorrents.length}`
          )

          quiTorrent = quiTorrents.find(
            (t) => t.name === dl.torrentName || (dl.torrentName !== '' && t.name.includes(dl.torrentName))
          )

          if (quiTorrent !== undefined) {
            // eslint-disable-next-line no-console
            console.warn(`[list.get.ts] matched by name: "${quiTorrent.name}" hash=${quiTorrent.hash}`)
            db.update(downloads).set({ torrentHash: quiTorrent.hash }).where(eq(downloads.id, dl.id)).run()
            dl.torrentHash = quiTorrent.hash
          } else {
            // eslint-disable-next-line no-console
            console.warn(
              `[list.get.ts] hash+name mismatch: db_hash="${dl.torrentHash}" name="${dl.torrentName}" — marking as failed`
            )
            db.update(downloads).set({ status: 'failed' }).where(eq(downloads.id, dl.id)).run()
            dl.status = 'failed'
          }
        }

        if (dl.status === 'failed') continue

        if (quiTorrent !== undefined) {
          const progressPct = quiTorrent.progress * 100
          const isComplete =
            quiTorrent.completion_on > 0 ||
            quiTorrent.downloaded >= quiTorrent.size ||
            progressPct >= 99.9 ||
            completedStates.has(quiTorrent.state)

          if (isComplete) {
            db.update(downloads)
              .set({
                torrentName: quiTorrent.name || dl.torrentName,
                progress: 100,
                etaSeconds: 0,
                downloadSpeed: 0,
                uploadSpeed: 0,
                sizeBytes: quiTorrent.size,
                downloadedBytes: quiTorrent.downloaded,
                numSeeds: quiTorrent.num_seeds,
                numLeechs: quiTorrent.num_leechs,
                status: 'completed',
                completedAt: new Date().toISOString()
              })
              .where(eq(downloads.id, dl.id))
              .run()

            dl.torrentName = quiTorrent.name || dl.torrentName
            dl.progress = 100
            dl.etaSeconds = 0
            dl.downloadSpeed = 0
            dl.uploadSpeed = 0
            dl.sizeBytes = quiTorrent.size
            dl.downloadedBytes = quiTorrent.downloaded
            dl.numSeeds = quiTorrent.num_seeds
            dl.numLeechs = quiTorrent.num_leechs
            dl.status = 'completed'
            dl.completedAt = new Date().toISOString()
          } else {
            db.update(downloads)
              .set({
                torrentName: quiTorrent.name || dl.torrentName,
                progress: progressPct,
                etaSeconds: quiTorrent.eta,
                downloadSpeed: quiTorrent.dlspeed,
                uploadSpeed: quiTorrent.upspeed,
                sizeBytes: quiTorrent.size,
                downloadedBytes: quiTorrent.downloaded,
                numSeeds: quiTorrent.num_seeds,
                numLeechs: quiTorrent.num_leechs
              })
              .where(eq(downloads.id, dl.id))
              .run()

            dl.torrentName = quiTorrent.name || dl.torrentName
            dl.progress = progressPct
            dl.etaSeconds = quiTorrent.eta
            dl.downloadSpeed = quiTorrent.dlspeed
            dl.uploadSpeed = quiTorrent.upspeed
            dl.sizeBytes = quiTorrent.size
            dl.downloadedBytes = quiTorrent.downloaded
            dl.numSeeds = quiTorrent.num_seeds
            dl.numLeechs = quiTorrent.num_leechs
          }
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[list.get.ts] qui fetch failed:', err)
    }
  }

  const jellyfin = useJellyfin()
  if (jellyfin !== null) {
    const completedWithPrep = results.filter((d) => d.status === 'completed' && d.completedAt !== null)
    const notifiedPaths = new Set<string>()

    for (const dl of completedWithPrep) {
      if (notifiedPaths.has(dl.id)) continue

      const completedAt = dl.completedAt
      if (completedAt === null) continue

      const elapsed = (Date.now() - new Date(completedAt).getTime()) / 1000
      const prepDelay = dl.sizeBytes / prepSpeedBytes

      if (elapsed >= prepDelay) {
        const targetPath = savePathMap[dl.savePath]
        if (targetPath !== undefined) {
          await jellyfin.notifyMediaUpdated([targetPath]).catch(() => {})
        }
        db.update(downloads).set({ completedAt: null }).where(eq(downloads.id, dl.id)).run()
        dl.completedAt = null
      }
    }
  }

  return { downloads: results }
})
