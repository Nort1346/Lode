import { downloads, users, settings } from '#server/database/schema'
import { eq, inArray } from 'drizzle-orm'
import { useDbAsync, dbGet, dbAll, dbRun } from '#server/utils/db'
import { sendDownloadCompleteWebhook } from '#server/utils/notifications/discord'
import { notifyDownloadComplete } from '#server/utils/notifications/notifications'
import { createLogger } from '#server/utils/logger'
import { normalizeEta } from '#server/utils/torrents/eta'
import { swarmSeedCount } from '#server/utils/torrents/swarm'
import { extractMagnetHash } from '#server/utils/clients/qbittorrent'
import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'
import type { SyncResult } from '#server/types/torrent'

const log = createLogger('TorrentSync')

const completedStates = new Set(['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'])

// A download whose torrent has vanished from qBittorrent is treated as completed
// (instead of failed) when auto-remove of finished torrents is enabled and the
// last recorded progress already reached this threshold.
const AUTO_REMOVE_COMPLETE_MIN_PROGRESS = 90

// A freshly created download may not be visible in qBittorrent yet (add still in
// progress, e.g. guid fetch + file upload). Within this grace window it is
// skipped instead of being marked failed.
const NEW_DOWNLOAD_GRACE_MS = 2 * 60 * 1000

let firstSyncReported = false
const zeroSeedDownloads = new Set<string>()

export function resetSyncDiagnostics(): void {
  firstSyncReported = false
  zeroSeedDownloads.clear()
}

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
  const result: SyncResult = { synced: 0, completed: 0, failed: 0, removed: 0 }

  // Paused rows are synced too so external pause/resume in qBittorrent is picked up
  const activeDownloads = await dbAll(
    db
      .select()
      .from(downloads)
      .where(inArray(downloads.status, ['downloading', 'paused']))
  )

  if (activeDownloads.length === 0) return result

  const allUsers = await dbAll(db.select().from(users))
  const userMap = new Map(allUsers.map((u) => [u.id, u.username]))
  const discordIdMap = new Map(allUsers.map((u) => [u.id, u.discordId ?? null]))

  const countdownEnabled = await isPrepCountdownEnabled()
  const autoRemoveCompleted = (await getSetting(SETTINGS.QBIT_AUTO_REMOVE_COMPLETED)) === 'true'

  let qbitTorrents
  try {
    const qbit = useQBittorrent()
    qbitTorrents = await qbit.getAllTorrents()
  } catch (err: unknown) {
    log.error(err instanceof Error ? err : new Error(String(err)), 'qBittorrent fetch failed')
    return result
  }

  if (!firstSyncReported) {
    firstSyncReported = true
    const zeroCompleteTorrents = qbitTorrents.filter((t) => t.num_complete === 0).length
    log.info(
      `first sync after start: ${qbitTorrents.length} torrent(s) in qBittorrent, ${zeroCompleteTorrents} with num_complete=0, ${activeDownloads.length} active download(s)`
    )
  }

  if (qbitTorrents.length === 0) {
    log.info(
      `qBittorrent torrent list is empty - resolving ${activeDownloads.length} active download(s) against empty state`
    )
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

    const dlTag = dl.qbitTag
    if (qbitTorrent === undefined && dlTag !== null && dlTag !== '') {
      qbitTorrent = qbitTorrents.find((t) =>
        t.tags
          .split(',')
          .map((s) => s.trim())
          .includes(dlTag)
      )

      if (qbitTorrent !== undefined) {
        log.warn(
          `matched torrent by tag instead of hash: id=${dl.id} tag="${dlTag}" matched_hash=${qbitTorrent.hash} matched_name="${qbitTorrent.name}"`
        )
        await dbRun(
          db
            .update(downloads)
            .set({ torrentHash: qbitTorrent.hash, torrentName: qbitTorrent.name })
            .where(eq(downloads.id, dl.id))
        )
        dl.torrentHash = qbitTorrent.hash
        dl.torrentName = qbitTorrent.name
      }
    }

    if (qbitTorrent === undefined && qbitTorrents.length > 0 && dl.torrentName !== '') {
      qbitTorrent = qbitTorrents.find((t) => t.name === dl.torrentName || t.name.includes(dl.torrentName))

      if (qbitTorrent !== undefined) {
        log.warn(
          `matched torrent by name instead of hash: id=${dl.id} hash=${dlHash ?? 'null'} name="${dl.torrentName}" matched_hash=${qbitTorrent.hash} matched_name="${qbitTorrent.name}"`
        )
        await dbRun(db.update(downloads).set({ torrentHash: qbitTorrent.hash }).where(eq(downloads.id, dl.id)))
        dl.torrentHash = qbitTorrent.hash
      }
    }

    if (qbitTorrent === undefined) {
      const ageMs = Date.now() - new Date(dl.createdAt).getTime()
      if (ageMs < NEW_DOWNLOAD_GRACE_MS) {
        log.info(`skipping young download not yet found in qBittorrent: id=${dl.id} age=${Math.round(ageMs / 1000)}s`)
        continue
      }

      const lastProgressPct = dl.sizeBytes > 0 ? (dl.downloadedBytes / dl.sizeBytes) * 100 : 0
      const observedComplete = dl.sizeBytes > 0 && dl.downloadedBytes * 100 >= dl.sizeBytes * 99.9
      const inferredComplete = autoRemoveCompleted && lastProgressPct >= AUTO_REMOVE_COMPLETE_MIN_PROGRESS

      if (observedComplete || inferredComplete) {
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
        if (inferredComplete) {
          log.info(
            `marked as completed - torrent no longer in qBittorrent (auto-remove enabled): id=${dl.id} hash=${dl.torrentHash} name="${dl.torrentName}" last progress=${lastProgressPct.toFixed(1)}%`
          )
        }
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
        // Distinguish a torrent that existed in qBittorrent and was deleted (e.g. manually
        // removed via the qB WebUI) from one that never appeared there (failed add).
        const wasConfirmed = dl.torrentHash !== null || dl.progress > 0 || dl.torrentName !== ''
        if (wasConfirmed) {
          log.info(
            `marking download as removed - torrent deleted from qBittorrent: id=${dl.id} hash=${dl.torrentHash} name="${dl.torrentName}" progress=${dl.progress}%`
          )
          await dbRun(db.update(downloads).set({ status: 'removed' }).where(eq(downloads.id, dl.id)))
          result.removed++
        } else {
          log.warn(
            `marking download as failed - torrent never appeared in qBittorrent: id=${dl.id} hash=${dl.torrentHash} name="${dl.torrentName}" progress=${dl.progress}%`
          )
          await dbRun(db.update(downloads).set({ status: 'failed' }).where(eq(downloads.id, dl.id)))
          result.failed++
        }
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
            numSeeds: swarmSeedCount(qbitTorrent),
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
      const isPaused = qbitTorrent.state === 'pausedDL'
      const remainingBytes = Math.max(qbitTorrent.size - qbitTorrent.downloaded, 0)
      const etaSeconds = isPaused
        ? 0
        : normalizeEta(qbitTorrent.dlspeed_avg > 0 ? remainingBytes / qbitTorrent.dlspeed_avg : qbitTorrent.eta)
      const numSeeds = swarmSeedCount(qbitTorrent)
      if (numSeeds === 0) {
        if (!zeroSeedDownloads.has(dl.id) && qbitTorrent.dlspeed > 0) {
          log.warn(
            `zero seeders while actively downloading: id=${dl.id} hash=${qbitTorrent.hash} name="${qbitTorrent.name}" num_seeds=${qbitTorrent.num_seeds} num_complete=${qbitTorrent.num_complete} dlspeed=${qbitTorrent.dlspeed} progress=${progressPct.toFixed(1)}% state=${qbitTorrent.state}`
          )
        }
        zeroSeedDownloads.add(dl.id)
      } else if (zeroSeedDownloads.delete(dl.id)) {
        log.info(
          `seeders restored: id=${dl.id} hash=${qbitTorrent.hash} num_seeds=${qbitTorrent.num_seeds} num_complete=${qbitTorrent.num_complete}`
        )
      }
      await dbRun(
        db
          .update(downloads)
          .set({
            torrentName: qbitTorrent.name || dl.torrentName,
            progress: progressPct,
            etaSeconds,
            downloadSpeed: isPaused ? 0 : qbitTorrent.dlspeed,
            uploadSpeed: isPaused ? 0 : qbitTorrent.upspeed,
            sizeBytes: qbitTorrent.size,
            downloadedBytes: qbitTorrent.downloaded,
            numSeeds,
            numLeechs: qbitTorrent.num_leechs,
            status: isPaused ? 'paused' : 'downloading'
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
    (d) => d.notifiedAt === null
  )

  if (completedWithPrep.length === 0) return

  const allUsers = await dbAll(db.select().from(users))
  const userMap = new Map(allUsers.map((u) => [u.id, u.username]))
  const discordIdMap = new Map(allUsers.map((u) => [u.id, u.discordId ?? null]))

  let needsCacheInvalidation = false

  for (const dl of completedWithPrep) {
    if (dl.notifiedAt !== null) continue

    // A completed row without a completion timestamp (e.g. pre-migration data) is treated as ready
    const elapsed =
      dl.completedAt === null ? Number.POSITIVE_INFINITY : (Date.now() - new Date(dl.completedAt).getTime()) / 1000
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
      await dbRun(db.update(downloads).set({ notifiedAt: new Date().toISOString() }).where(eq(downloads.id, dl.id)))
    }
  }

  if (needsCacheInvalidation && jellyfin !== null) {
    jellyfin.invalidateLibraryCache()
  }
}
