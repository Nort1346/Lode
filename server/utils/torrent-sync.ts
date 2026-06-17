import { downloads, users } from '../database/schema'
import { eq } from 'drizzle-orm'
import { sendDownloadCompleteWebhook } from './discord'

interface SyncResult {
  synced: number
  completed: number
  failed: number
}

const completedStates = new Set(['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'])

function notifyDiscord(
  dl: {
    id: string
    label: string
    torrentName: string
    savePath: string
    sizeBytes: number
    completedAt: string | null
    tmdbId: number | null
    mediaType: string | null
    userId: string
  },
  userMap: Map<string, string>
): void {
  const completedAt = dl.completedAt ?? new Date().toISOString()
  void sendDownloadCompleteWebhook({
    id: dl.id,
    label: dl.label,
    torrentName: dl.torrentName,
    savePath: dl.savePath,
    sizeBytes: dl.sizeBytes,
    completedAt,
    username: userMap.get(dl.userId) ?? 'unknown',
    tmdbId: dl.tmdbId,
    mediaType: dl.mediaType
  }).catch((err) => console.error('[torrent-sync] webhook failed:', err))
}

export async function syncTorrentStatus(): Promise<SyncResult> {
  const db = useDb()
  const result: SyncResult = { synced: 0, completed: 0, failed: 0 }

  const activeDownloads = db.select().from(downloads).where(eq(downloads.status, 'downloading')).all()

  if (activeDownloads.length === 0) return result

  const allUsers = db.select().from(users).all()
  const userMap = new Map(allUsers.map((u) => [u.id, u.username]))

  let quiTorrents
  try {
    const qui = useQui()
    quiTorrents = await qui.getAllTorrents()
  } catch (err) {
    console.error('[torrent-sync] qui fetch failed:', err)
    return result
  }

  for (const dl of activeDownloads) {
    let quiTorrent = dl.torrentHash !== null ? quiTorrents.find((t) => t.hash === dl.torrentHash) : undefined

    if (quiTorrent === undefined && quiTorrents.length > 0 && dl.torrentName !== '') {
      quiTorrent = quiTorrents.find((t) => t.name === dl.torrentName || t.name.includes(dl.torrentName))

      if (quiTorrent !== undefined) {
        db.update(downloads).set({ torrentHash: quiTorrent.hash }).where(eq(downloads.id, dl.id)).run()
        dl.torrentHash = quiTorrent.hash
      }
    }

    if (quiTorrent === undefined) {
      if (dl.downloadedBytes > 0 && dl.sizeBytes > 0 && dl.downloadedBytes >= dl.sizeBytes) {
        db.update(downloads)
          .set({
            progress: 100,
            etaSeconds: 0,
            downloadSpeed: 0,
            uploadSpeed: 0,
            status: 'completed',
            completedAt: new Date().toISOString()
          })
          .where(eq(downloads.id, dl.id))
          .run()
        result.completed++
        void notifyDiscord(dl, userMap)
      } else {
        db.update(downloads).set({ status: 'failed' }).where(eq(downloads.id, dl.id)).run()
        result.failed++
      }
      continue
    }

    const progressPct = quiTorrent.progress * 100
    const isComplete =
      quiTorrent.size > 0 &&
      (quiTorrent.completion_on > 0 ||
        quiTorrent.downloaded >= quiTorrent.size ||
        progressPct >= 99.9 ||
        completedStates.has(quiTorrent.state))

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
      result.completed++
      void notifyDiscord(dl, userMap)
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
    }

    result.synced++
  }

  return result
}

export async function notifyJellyfinIfNeeded(): Promise<void> {
  const db = useDb()
  const config = useRuntimeConfig()
  const jellyfin = useJellyfin()
  if (jellyfin === null) return

  const prepSpeedBytes = (config.jellyfinPrepSpeedMb ?? 8) * 1024 * 1024

  const savePathMap: Record<string, string> = {
    movies: config.savePathMovies,
    series: config.savePathSeries,
    games: config.savePathGames,
    books: config.savePathBooks,
    music: config.savePathMusic
  }

  const completedWithPrep = db
    .select()
    .from(downloads)
    .where(eq(downloads.status, 'completed'))
    .all()
    .filter((d) => d.completedAt !== null)

  for (const dl of completedWithPrep) {
    if (dl.completedAt === null) continue

    const elapsed = (Date.now() - new Date(dl.completedAt).getTime()) / 1000
    const prepDelay = dl.sizeBytes / prepSpeedBytes

    if (elapsed >= prepDelay) {
      const targetPath = savePathMap[dl.savePath]
      if (targetPath !== undefined) {
        await jellyfin.notifyMediaUpdated([targetPath]).catch(() => {})
      }
      db.update(downloads).set({ completedAt: null }).where(eq(downloads.id, dl.id)).run()
    }
  }
}
