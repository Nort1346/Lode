import { downloads, users, settings } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbGet, dbAll, dbRun } from '#server/utils/db'
import { sendDownloadCompleteWebhook } from '#server/utils/notifications/discord'
import { notifyDownloadComplete } from '#server/utils/notifications/notifications'
import { createLogger } from '#server/utils/logger'
import { normalizeEta } from '#server/utils/torrents/eta'
import { extractMagnetHash } from '#server/utils/clients/qbittorrent'
import type { SyncResult } from '#server/types/torrent'

const log = createLogger('TorrentSync')

const completedStates = new Set(['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'])

async function isPrepCountdownEnabled(): Promise<boolean> {
  const db = await useDbAsync()
  const row = await dbGet(
    db.select({ value: settings.value }).from(settings).where(eq(settings.key, 'prep_countdown_enabled'))
  )
  return row?.value === 'true'
}

async function getPrepSpeedMb(): Promise<number> {
  const db = await useDbAsync()
  const row = await dbGet(db.select({ value: settings.value }).from(settings).where(eq(settings.key, 'prep_speed_mb')))
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
  const db = await useDbAsync()
  const result: SyncResult = { synced: 0, completed: 0, failed: 0 }

  const activeDownloads = await dbAll(db.select().from(downloads).where(eq(downloads.status, 'downloading')))

  if (activeDownloads.length === 0) return result

  const allUsers = await dbAll(db.select().from(users))
  const userMap = new Map(allUsers.map((u) => [u.id, u.username]))
  const discordIdMap = new Map(allUsers.map((u) => [u.id, u.discordId ?? null]))

  const countdownEnabled = await isPrepCountdownEnabled()

  let qbitTorrents
  try {
    const qbit = useQBittorrent()
    qbitTorrents = await qbit.getAllTorrents()
  } catch (err: unknown) {
    log.error(err instanceof Error ? err : new Error(String(err)), 'qBittorrent fetch failed')
    return result
  }

  for (const dl of activeDownloads) {
    let dlHash = dl.torrentHash
    if (dlHash === null) {
      dlHash = extractMagnetHash(dl.magnetLink)
    }

    let qbitTorrent = dlHash !== null ? qbitTorrents.find((t) => t.hash === dlHash) : undefined

    if (qbitTorrent !== undefined && dl.torrentHash === null && dlHash !== null) {
      await dbRun(db.update(downloads).set({ torrentHash: dlHash }).where(eq(downloads.id, dl.id)))
      dl.torrentHash = dlHash
    }

    if (qbitTorrent === undefined && qbitTorrents.length > 0 && dl.torrentName !== '') {
      qbitTorrent = qbitTorrents.find((t) => t.name === dl.torrentName || t.name.includes(dl.torrentName))

      if (qbitTorrent !== undefined) {
        await dbRun(db.update(downloads).set({ torrentHash: qbitTorrent.hash }).where(eq(downloads.id, dl.id)))
        dl.torrentHash = qbitTorrent.hash
      }
    }

    if (qbitTorrent === undefined) {
      if (qbitTorrents.length === 0) {
        log.warn(
          `empty qBittorrent torrent list - skipping status updates for ${activeDownloads.length} active download(s)`
        )
        break
      }

      if (dl.sizeBytes > 0 && dl.downloadedBytes * 100 >= dl.sizeBytes * 99.9) {
        await dbRun(
          db
            .update(downloads)
            .set({
              progress: 100,
              etaSeconds: 0,
              downloadSpeed: 0,
              uploadSpeed: 0,
              status: 'completed',
              completedAt: new Date().toISOString()
            })
            .where(eq(downloads.id, dl.id))
        )
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
        log.warn(
          `marking download as failed - torrent not found in qBittorrent: id=${dl.id} hash=${dl.torrentHash} name="${dl.torrentName}" progress=${dl.progress}%`
        )
        await dbRun(db.update(downloads).set({ status: 'failed' }).where(eq(downloads.id, dl.id)))
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
      await dbRun(
        db
          .update(downloads)
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
      )
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
      const remainingBytes = Math.max(qbitTorrent.size - qbitTorrent.downloaded, 0)
      const etaSeconds = normalizeEta(
        qbitTorrent.dlspeed_avg > 0 ? remainingBytes / qbitTorrent.dlspeed_avg : qbitTorrent.eta
      )
      await dbRun(
        db
          .update(downloads)
          .set({
            torrentName: qbitTorrent.name || dl.torrentName,
            progress: progressPct,
            etaSeconds,
            downloadSpeed: qbitTorrent.dlspeed,
            uploadSpeed: qbitTorrent.upspeed,
            sizeBytes: qbitTorrent.size,
            downloadedBytes: qbitTorrent.downloaded,
            numSeeds: Math.max(qbitTorrent.num_seeds, qbitTorrent.num_complete > 0 ? qbitTorrent.num_complete : 0),
            numLeechs: qbitTorrent.num_leechs
          })
          .where(eq(downloads.id, dl.id))
      )
    }

    result.synced++
  }

  return result
}

export async function notifyJellyfinIfNeeded(): Promise<void> {
  const db = await useDbAsync()
  const config = useRuntimeConfig()
  const jellyfin = useJellyfin()

  const countdownEnabled = await isPrepCountdownEnabled()
  const prepSpeedMb = await getPrepSpeedMb()
  const prepSpeedBytes = prepSpeedMb * 1024 * 1024

  const savePathMap: Record<string, string> = {
    movies: config.savePathMovies,
    series: config.savePathSeries,
    games: config.savePathGames,
    books: config.savePathBooks,
    music: config.savePathMusic
  }

  const completedWithPrep = (await dbAll(db.select().from(downloads).where(eq(downloads.status, 'completed')))).filter(
    (d) => d.completedAt !== null
  )

  if (completedWithPrep.length === 0) return

  const allUsers = await dbAll(db.select().from(users))
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
      await dbRun(db.update(downloads).set({ completedAt: null }).where(eq(downloads.id, dl.id)))
    }
  }

  if (needsCacheInvalidation && jellyfin !== null) {
    jellyfin.invalidateLibraryCache()
  }
}
