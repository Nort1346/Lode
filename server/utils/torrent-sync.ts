import { downloads, users, settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { sendDownloadCompleteWebhook } from './discord'
import { notifyDownloadComplete } from './notifications'
import { createLogger } from '#server/utils/logger'
import type { SyncResult } from '#server/types/torrent'

const log = createLogger('TorrentSync')

const completedStates = new Set(['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'])

function isPrepCountdownEnabled(): boolean {
  const row = useDb()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, 'prep_countdown_enabled'))
    .get()
  return row?.value === 'true'
}

function getPrepSpeedMb(): number {
  const row = useDb().select({ value: settings.value }).from(settings).where(eq(settings.key, 'prep_speed_mb')).get()
  return row !== undefined ? Number(row.value) : 15
}

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
  userMap: Map<string, string>,
  discordIdMap: Map<string, string | null>
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
    mediaType: dl.mediaType,
    discordId: discordIdMap.get(dl.userId) ?? null
  }).catch((err) => log.error(err, 'webhook failed'))
}

export async function syncTorrentStatus(): Promise<SyncResult> {
  const db = useDb()
  const result: SyncResult = { synced: 0, completed: 0, failed: 0 }

  const activeDownloads = db.select().from(downloads).where(eq(downloads.status, 'downloading')).all()

  if (activeDownloads.length === 0) return result

  const allUsers = db.select().from(users).all()
  const userMap = new Map(allUsers.map((u) => [u.id, u.username]))
  const discordIdMap = new Map(allUsers.map((u) => [u.id, u.discordId ?? null]))

  const countdownEnabled = isPrepCountdownEnabled()

  let qbitTorrents
  try {
    const qbit = useQBittorrent()
    qbitTorrents = await qbit.getAllTorrents()
  } catch (err: unknown) {
    log.error(err instanceof Error ? err : new Error(String(err)), 'qBittorrent fetch failed')
    return result
  }

  for (const dl of activeDownloads) {
    let qbitTorrent = dl.torrentHash !== null ? qbitTorrents.find((t) => t.hash === dl.torrentHash) : undefined

    if (qbitTorrent === undefined && qbitTorrents.length > 0 && dl.torrentName !== '') {
      qbitTorrent = qbitTorrents.find((t) => t.name === dl.torrentName || t.name.includes(dl.torrentName))

      if (qbitTorrent !== undefined) {
        db.update(downloads).set({ torrentHash: qbitTorrent.hash }).where(eq(downloads.id, dl.id)).run()
        dl.torrentHash = qbitTorrent.hash
      }
    }

    if (qbitTorrent === undefined) {
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
        if (!countdownEnabled) {
          void notifyDiscord(dl, userMap, discordIdMap)
          void notifyDownloadComplete(
            dl.userId,
            dl.id,
            dl.mediaType,
            dl.label || dl.torrentName || 'Download',
            dl.posterUrl,
            dl.sizeBytes,
            dl.savePath,
            dl.tmdbId
          )
        }
      } else {
        db.update(downloads).set({ status: 'failed' }).where(eq(downloads.id, dl.id)).run()
        result.failed++
      }
      continue
    }

    const progressPct = qbitTorrent.progress * 100
    const isComplete =
      qbitTorrent.size > 0 &&
      (qbitTorrent.completion_on > 0 ||
        qbitTorrent.downloaded >= qbitTorrent.size ||
        progressPct >= 99.9 ||
        completedStates.has(qbitTorrent.state))

    if (isComplete) {
      db.update(downloads)
        .set({
          torrentName: qbitTorrent.name || dl.torrentName,
          progress: 100,
          etaSeconds: 0,
          downloadSpeed: 0,
          uploadSpeed: 0,
          sizeBytes: qbitTorrent.size,
          downloadedBytes: qbitTorrent.downloaded,
          numSeeds: Math.max(qbitTorrent.num_seeds, qbitTorrent.num_complete > 0 ? qbitTorrent.num_complete : 0),
          numLeechs: qbitTorrent.num_leechs,
          status: 'completed',
          completedAt: new Date().toISOString()
        })
        .where(eq(downloads.id, dl.id))
        .run()
      result.completed++
      if (!countdownEnabled) {
        void notifyDiscord(dl, userMap, discordIdMap)
        void notifyDownloadComplete(
          dl.userId,
          dl.id,
          dl.mediaType,
          dl.label || dl.torrentName || 'Download',
          dl.posterUrl,
          dl.sizeBytes,
          dl.savePath,
          dl.tmdbId
        )
      }
    } else {
      db.update(downloads)
        .set({
          torrentName: qbitTorrent.name || dl.torrentName,
          progress: progressPct,
          etaSeconds: qbitTorrent.eta,
          downloadSpeed: qbitTorrent.dlspeed,
          uploadSpeed: qbitTorrent.upspeed,
          sizeBytes: qbitTorrent.size,
          downloadedBytes: qbitTorrent.downloaded,
          numSeeds: Math.max(qbitTorrent.num_seeds, qbitTorrent.num_complete > 0 ? qbitTorrent.num_complete : 0),
          numLeechs: qbitTorrent.num_leechs
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

  const countdownEnabled = isPrepCountdownEnabled()
  const prepSpeedMb = getPrepSpeedMb()
  const prepSpeedBytes = prepSpeedMb * 1024 * 1024

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

  if (completedWithPrep.length === 0) return

  const allUsers = db.select().from(users).all()
  const userMap = new Map(allUsers.map((u) => [u.id, u.username]))
  const discordIdMap = new Map(allUsers.map((u) => [u.id, u.discordId ?? null]))

  let needsCacheInvalidation = false

  for (const dl of completedWithPrep) {
    if (dl.completedAt === null) continue

    const elapsed = (Date.now() - new Date(dl.completedAt).getTime()) / 1000
    const prepDelay = countdownEnabled ? dl.sizeBytes / prepSpeedBytes : 0

    if (elapsed >= prepDelay) {
      if (jellyfin !== null) {
        const targetPath = savePathMap[dl.savePath]
        if (targetPath !== undefined) {
          await jellyfin.notifyMediaUpdated([targetPath]).catch(() => {})
          needsCacheInvalidation = true
        }
      }
      if (countdownEnabled) {
        void notifyDiscord(dl, userMap, discordIdMap)
        void notifyDownloadComplete(
          dl.userId,
          dl.id,
          dl.mediaType,
          dl.label || dl.torrentName || 'Download',
          dl.posterUrl,
          dl.sizeBytes,
          dl.savePath,
          dl.tmdbId
        )
      }
      db.update(downloads).set({ completedAt: null }).where(eq(downloads.id, dl.id)).run()
    }
  }

  if (needsCacheInvalidation && jellyfin !== null) {
    jellyfin.invalidateLibraryCache()
  }
}
