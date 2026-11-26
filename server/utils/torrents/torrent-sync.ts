import { dirname, join, resolve } from 'node:path'
import { downloads, users, settings } from '#server/database/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { useDbAsync, dbGet, dbAll, dbRun } from '#server/utils/db'
import { organizeCompletedDownload } from '#server/utils/library/organize-completed'
import { getMediaConfig } from '#server/utils/library/media-settings'
import type { OrganizeJobInput } from '#server/types/media-organize'
import { sendDownloadCompleteWebhook } from '#server/utils/notifications/discord'
import type { DiscordDownloadNotifyInput } from '#server/types/discord'
import { notifyDownloadComplete } from '#server/utils/notifications/notifications'
import { createLogger } from '#server/utils/logger'
import { normalizeEta } from '#server/utils/torrents/eta'
import { trackServerEta } from '#server/utils/torrents/eta-tracker'
import { removeOrganizedMissingFileTorrents } from '#server/utils/torrents/missing-files'
import { swarmSeedCount } from '#server/utils/torrents/swarm'
import type { EtaTrackerInput } from '#shared/eta-tracker'
import { extractMagnetHash } from '#server/utils/clients/qbittorrent'
import { getSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'
import {
  CHECKING_STATES,
  COMPLETED_STATES,
  PAUSED_DOWNLOAD_STATES,
  type DownloadRow,
  type SyncResult
} from '#server/types/torrent'

const log = createLogger('TorrentSync')

// A download whose torrent has vanished from qBittorrent is treated as completed
// (instead of failed) when auto-remove of finished torrents is enabled and the
// last recorded progress already reached this threshold.
const AUTO_REMOVE_COMPLETE_MIN_PROGRESS = 90

// A freshly created download may not be visible in qBittorrent yet (add still in
// progress, e.g. guid fetch + file upload). Within this grace window it is
// skipped instead of being marked failed.
const NEW_DOWNLOAD_GRACE_MS = 2 * 60 * 1000

// A failed import is retried for a bounded window after completion, long enough
// to heal a transient staging/config problem without retrying forever.
const FAILED_ORGANIZE_RETRY_WINDOW_MS = 10 * NEW_DOWNLOAD_GRACE_MS

let firstSyncReported = false
const zeroSeedDownloads = new Set<string>()

// Downloads whose completion webhook is currently being dispatched. The ready
// pass is single-flight (notifySweepRunning), so this is a second line of
// defence: a slow webhook that outlives its sweep must not be dispatched again
// by a later pass.
const discordInflight = new Set<string>()

// Downloads whose library import is currently running. The completion path and
// the pending sweep can both pick up the same row, so the guard makes sure a
// single import at a time is started per download.
const organizeInflight = new Set<string>()

// The sync is triggered by API reads as well as by the timer, so two overlapping
// calls would otherwise run two sweeps over the same snapshot. The second sweep
// could then reach a row after the first one finished and re-import it, which
// would overwrite the settled 'done' status with 'skipped'.
let pendingSweepRunning = false

// The missing-files sweep is triggered by the same timer and API reads; a
// second run would query qBittorrent again and could try to delete the same
// torrent twice while the first delete is still in flight.
let missingFilesSweepRunning = false

// The ready-notification pass is triggered by the timer and by API reads, so
// two overlapping runs could both see notifiedAt as null and send twice.
let notifySweepRunning = false

export function resetSyncDiagnostics(): void {
  firstSyncReported = false
  zeroSeedDownloads.clear()
  discordInflight.clear()
  organizeInflight.clear()
  pendingSweepRunning = false
  missingFilesSweepRunning = false
  notifySweepRunning = false
}

interface OrganizeSource {
  id: string
  savePath: string
  torrentName: string
  label: string
  tmdbId: number | null
  mediaType: 'movie' | 'tv' | null
  resolution: string | null
}

function getLibraryRoots(): Record<string, string> {
  const config = useRuntimeConfig()
  return {
    movies: config.savePathMovies as string,
    series: config.savePathSeries as string,
    games: config.savePathGames as string,
    books: config.savePathBooks as string,
    music: config.savePathMusic as string
  }
}

// Point Jellyfin at the folder the import just wrote to, so the scan starts
// immediately instead of waiting for the library-wide notification pass.
async function notifyOrganizedFolder(input: {
  savePath: string
  targetRelativePath: string | null
  importedFiles: number
}): Promise<void> {
  if (input.importedFiles === 0 || input.targetRelativePath === null || input.targetRelativePath === '') return

  const jellyfin = useJellyfin()
  if (jellyfin === null) return

  const libraryRoot = getLibraryRoots()[input.savePath]
  if (libraryRoot === undefined || libraryRoot === '') return

  const folder = join(libraryRoot, dirname(input.targetRelativePath))
  try {
    await jellyfin.notifyMediaUpdated([folder])
    jellyfin.invalidateLibraryCache()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`jellyfin notify failed: path=${folder}: ${msg}`)
  }
}

// A download added while organization was enabled can be sitting in staging
// when the admin disables it before completion. With no import to run, its
// files are stranded; report that instead of a clean skip that would announce
// the download as ready.
async function isStrandedInStaging(hash: string): Promise<boolean> {
  const config = useRuntimeConfig()
  const staging = [config.downloadPathMovies, config.downloadPathSeries]
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .map((value) => resolve(value))
  if (staging.length === 0) return false

  let savePath: string
  try {
    const torrent = await useQBittorrent().findTorrentByHash(hash)
    savePath = torrent?.save_path ?? ''
  } catch {
    return false
  }
  if (savePath === '') return false

  const resolved = resolve(savePath)
  return staging.some((dir) => dir === resolved)
}

// Best-effort library import for a freshly completed download. Never throws:
// any failure is persisted on the row as organizeStatus='failed' so the sync
// loop keeps working and the admin can see the reason.
async function organizeAfterComplete(source: OrganizeSource, hash: string): Promise<void> {
  if (organizeInflight.has(source.id)) {
    log.info(`organize already in flight: id=${source.id}`)
    return
  }
  organizeInflight.add(source.id)

  try {
    const db = await useDbAsync()
    try {
      // The pending sweep works from a snapshot taken before the import ran, so
      // the row may already be settled here (another sweep or the completion
      // path finished first). Re-read it and leave settled rows alone instead of
      // overwriting 'done' with the result of a duplicate import.
      const current = await dbGet(
        db
          .select({ status: downloads.organizeStatus, error: downloads.organizeError })
          .from(downloads)
          .where(eq(downloads.id, source.id))
      )
      const previousStatus = current?.status
      if (previousStatus !== undefined && previousStatus !== 'pending' && previousStatus !== 'failed') {
        log.info(`organize skipped, row already settled: id=${source.id} status=${previousStatus}`)
        return
      }

      const media = await getMediaConfig()
      if (!media.enabled) {
        if (await isStrandedInStaging(hash)) {
          await dbRun(
            db
              .update(downloads)
              .set({
                organizeStatus: 'failed',
                organizeError:
                  'download is in the staging dir but media organization is disabled; files were not imported',
                prepStartedAt: new Date().toISOString()
              })
              .where(eq(downloads.id, source.id))
          )
        } else if (previousStatus === 'failed') {
          await dbRun(
            db
              .update(downloads)
              .set({
                organizeStatus: 'failed',
                organizeError: 'media organization disabled; import not retried',
                prepStartedAt: new Date().toISOString()
              })
              .where(eq(downloads.id, source.id))
          )
        } else {
          await dbRun(
            db
              .update(downloads)
              .set({ organizeStatus: 'skipped', organizeError: null, prepStartedAt: new Date().toISOString() })
              .where(eq(downloads.id, source.id))
          )
        }
        return
      }
      const config = useRuntimeConfig()
      const job: OrganizeJobInput = {
        downloadId: source.id,
        savePath: source.savePath,
        torrentName: source.torrentName,
        label: source.label,
        tmdbId: source.tmdbId,
        mediaType: source.mediaType,
        resolution: source.resolution
      }
      const result = await organizeCompletedDownload(hash, job, {
        qbit: useQBittorrent(),
        libraryMovies: config.savePathMovies as string,
        librarySeries: config.savePathSeries as string,
        // Staging is what makes the import *arr-like: qBittorrent keeps the
        // torrent intact there and Lode copies/hardlinks out of it.
        stagingMovies: (config.downloadPathMovies as string | undefined) ?? '',
        stagingSeries: (config.downloadPathSeries as string | undefined) ?? '',
        importMode: media.importMode,
        importExtraFiles: media.importExtraFiles,
        extraFileExtensions: media.extraFileExtensions,
        cleanupStaging: media.cleanupStaging
      })
      await dbRun(
        db
          .update(downloads)
          .set({
            organizedPath: result.targetRelativePath,
            organizeStatus: result.status,
            organizeError: result.error,
            prepStartedAt: result.status === 'pending' ? null : new Date().toISOString()
          })
          .where(eq(downloads.id, source.id))
      )
      log.info(
        `organize ${result.status}: id=${source.id} files=${result.importedFiles} extras=${result.extrasImported} target=${result.targetRelativePath ?? 'none'}${
          result.error !== null ? ` error="${result.error}"` : ''
        }`
      )
      await notifyOrganizedFolder({
        savePath: source.savePath,
        targetRelativePath: result.targetRelativePath,
        importedFiles: result.importedFiles
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn(`organize failed: id=${source.id}: ${msg}`)
      await dbRun(
        db
          .update(downloads)
          .set({ organizeStatus: 'failed', organizeError: msg, prepStartedAt: new Date().toISOString() })
          .where(eq(downloads.id, source.id))
      ).catch((writeErr: unknown) => {
        const writeMsg = writeErr instanceof Error ? writeErr.message : String(writeErr)
        log.warn(`organize failure persistence failed: id=${source.id}: ${writeMsg}`)
      })
    }
  } catch (err) {
    // Setup failures (e.g. the DB being unreachable) must not escape: callers
    // fire this job with `void`, so a rejection would be unhandled.
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`organize setup failed: id=${source.id}: ${msg}`)
  } finally {
    organizeInflight.delete(source.id)
  }
}

// A crash between marking a download completed and persisting the import
// result leaves organizeStatus='pending' on a completed row. Retrying those on
// every sync heals a missed import without a manual re-download, even when
// nothing is actively downloading. Failed imports are retried for a bounded
// window after completion so a transient staging/config problem can recover.
// Only one sweep runs at a time: a second one would work from the same snapshot
// and could re-import a row that the first sweep already settled.
async function retryPendingOrganizes(): Promise<void> {
  if (pendingSweepRunning) return
  pendingSweepRunning = true

  try {
    const db = await useDbAsync()
    const candidates = await dbAll(
      db
        .select()
        .from(downloads)
        .where(and(eq(downloads.status, 'completed'), inArray(downloads.organizeStatus, ['pending', 'failed'])))
    )
    const retryCutoff = Date.now() - FAILED_ORGANIZE_RETRY_WINDOW_MS
    const pending = candidates.filter((dl) => {
      if (dl.organizeStatus === 'pending') return true
      return dl.completedAt !== null && new Date(dl.completedAt).getTime() >= retryCutoff
    })

    for (const dl of pending) {
      if (organizeInflight.has(dl.id)) continue

      const hash = dl.torrentHash ?? extractMagnetHash(dl.magnetLink)
      if (hash === null) {
        // Without a hash the torrent cannot be addressed; stop retrying and
        // surface the reason instead of looping on every sync.
        await dbRun(
          db
            .update(downloads)
            .set({
              organizeStatus: 'skipped',
              organizeError: 'torrent hash unavailable',
              prepStartedAt: new Date().toISOString()
            })
            .where(eq(downloads.id, dl.id))
        ).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          log.warn(`pending organize skip persistence failed: id=${dl.id}: ${msg}`)
        })
        continue
      }

      log.info(
        `${dl.organizeStatus === 'failed' ? 'retrying failed' : 'retrying pending'} organize: id=${dl.id} hash=${hash}`
      )
      await organizeAfterComplete(
        {
          id: dl.id,
          savePath: dl.savePath,
          torrentName: dl.torrentName,
          label: dl.label,
          tmdbId: dl.tmdbId,
          mediaType: dl.mediaType,
          resolution: dl.resolution
        },
        hash
      )
    }
  } finally {
    pendingSweepRunning = false
  }
}

async function isPrepCountdownEnabled(): Promise<boolean> {
  const db = await useDbAsync()
  const row = await dbGet(
    db.select({ value: settings.value }).from(settings).where(eq(settings.key, 'prep_countdown_enabled'))
  )
  return row?.value === 'true'
}

async function getPrepDelaySeconds(): Promise<number> {
  const db = await useDbAsync()
  const row = await dbGet(
    db.select({ value: settings.value }).from(settings).where(eq(settings.key, 'prep_delay_seconds'))
  )
  return row !== undefined ? Number(row.value) : 30
}

function notifyDiscord(
  dl: DiscordDownloadNotifyInput,
  userMap: Map<string, string>,
  discordIdMap: Map<string, string | null>
): void {
  if (discordInflight.has(dl.id)) {
    log.info(`skipping duplicate discord notify: id=${dl.id}`)
    return
  }
  discordInflight.add(dl.id)
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
    discordId: discordIdMap.get(dl.userId) ?? null,
    resolution: dl.resolution ?? null
  })
    .catch((err) => log.error(err, 'webhook failed'))
    .finally(() => {
      discordInflight.delete(dl.id)
    })
}

type ImportNotificationState = 'wait' | 'ready' | 'suppress'

// 'wait' holds the notification while an import is still running, 'ready'
// sends it, 'suppress' only settles notifiedAt so the row stops showing as
// "preparing" without announcing media that was never imported.
function importNotificationState(
  dl: Pick<DownloadRow, 'savePath' | 'organizeStatus' | 'organizeError'>
): ImportNotificationState {
  if (dl.savePath !== 'movies' && dl.savePath !== 'series') return 'ready'

  switch (dl.organizeStatus) {
    case 'pending':
      return 'wait'
    case 'done':
      return 'ready'
    case 'skipped':
      // An organization-disabled row has a clean skip; any error means the
      // files were not imported (vanished torrent, stranded staging, ...).
      return dl.organizeError === null || dl.organizeError === '' ? 'ready' : 'suppress'
    case 'failed':
      return 'suppress'
    default:
      return 'ready'
  }
}

// Tracker sample for one row; the fields that come from qBittorrent or from the
// status the sync just wrote are passed as overrides.
function etaSample(dl: DownloadRow, status: string, overrides: Partial<EtaTrackerInput> = {}): EtaTrackerInput {
  return {
    id: dl.id,
    status,
    createdAt: dl.createdAt,
    sizeBytes: dl.sizeBytes,
    downloadedBytes: dl.downloadedBytes,
    numSeeds: dl.numSeeds,
    downloadSpeed: dl.downloadSpeed,
    ...overrides
  }
}

export async function syncTorrentStatus(): Promise<SyncResult> {
  const db = await useDbAsync()
  const result: SyncResult = { synced: 0, completed: 0, failed: 0, removed: 0 }
  // Fresh rows for the shared ETA tracker. Recorded in one poll at the end so
  // every row of this sync is sampled at the same instant.
  const etaSamples: EtaTrackerInput[] = []

  // Runs before the early return so a crash-interrupted import is retried even
  // when nothing is actively downloading. Backgrounded so a long copy cannot
  // block API reads that trigger a sync.
  void retryPendingOrganizes().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`pending organize sweep failed: ${msg}`)
  })

  // Import after a `move` leaves qBittorrent pointing at files that are now in
  // the library. Drop those stuck "Missing Files" torrents (files are kept)
  // instead of letting them accumulate in the client.
  if (!missingFilesSweepRunning) {
    missingFilesSweepRunning = true
    void removeOrganizedMissingFileTorrents()
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn(`missing-files cleanup failed: ${msg}`)
      })
      .finally(() => {
        missingFilesSweepRunning = false
      })
  }

  // Paused and checking rows are synced too so external pause/resume and file verification are picked up
  const activeDownloads = await dbAll(
    db
      .select()
      .from(downloads)
      .where(inArray(downloads.status, ['checking', 'downloading', 'paused']))
  )

  if (activeDownloads.length === 0) {
    // Lets the shared tracker sweep entries that went stale while nothing was
    // active (e.g. after a download finished between two syncs).
    trackServerEta([])
    return result
  }

  const autoRemoveCompleted = (await getSetting(SETTINGS.QBIT_AUTO_REMOVE_COMPLETED)) === 'true'

  // Timestamp of this qBittorrent snapshot. Overlapping syncs finish in
  // arbitrary order, so the tracker must compare snapshot times, not finish
  // times - otherwise an older snapshot could overwrite a newer sample.
  const etaSampledAt = Date.now()

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
              completedAt: new Date().toISOString(),
              // The torrent is gone from qBittorrent, so its files cannot be
              // located reliably. Keep the reason on the row: a skipped import
              // must never produce a "ready" signal for media that was never
              // placed in the library. No import will run, so the wait starts
              // here even though the row is a media category.
              organizeStatus: 'skipped',
              organizeError: 'torrent vanished from qBittorrent; files could not be located for organization',
              prepStartedAt: new Date().toISOString()
            })
            .where(eq(downloads.id, dl.id))
        )
        result.completed++
        etaSamples.push(etaSample(dl, 'completed', { downloadedBytes: dl.sizeBytes, numSeeds: 0, downloadSpeed: 0 }))
        if (inferredComplete) {
          log.info(
            `marked as completed - torrent no longer in qBittorrent (auto-remove enabled): id=${dl.id} hash=${dl.torrentHash} name="${dl.torrentName}" last progress=${lastProgressPct.toFixed(1)}%`
          )
        }
        // The ready notification is sent by notifyJellyfinIfNeeded once the
        // prep gates open (countdown elapsed and import settled), so it never
        // announces a download that is still being imported.
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
          etaSamples.push(etaSample(dl, 'removed', { numSeeds: 0, downloadSpeed: 0 }))
        } else {
          log.warn(
            `marking download as failed - torrent never appeared in qBittorrent: id=${dl.id} hash=${dl.torrentHash} name="${dl.torrentName}" progress=${dl.progress}%`
          )
          await dbRun(db.update(downloads).set({ status: 'failed' }).where(eq(downloads.id, dl.id)))
          result.failed++
          etaSamples.push(etaSample(dl, 'failed', { numSeeds: 0, downloadSpeed: 0 }))
        }
      }
      continue
    }

    const progressPct = qbitTorrent.progress * 100
    const isChecking = CHECKING_STATES.has(qbitTorrent.state)

    if (isChecking) {
      const numSeeds = swarmSeedCount(qbitTorrent)
      if (dl.status !== 'checking') {
        log.info(
          `status changed: ${dl.status} -> checking: id=${dl.id} hash=${qbitTorrent.hash} state=${qbitTorrent.state}`
        )
      }
      await dbRun(
        db
          .update(downloads)
          .set({
            torrentName: qbitTorrent.name || dl.torrentName,
            progress: progressPct,
            etaSeconds: 0,
            downloadSpeed: 0,
            uploadSpeed: 0,
            sizeBytes: qbitTorrent.size,
            downloadedBytes: qbitTorrent.downloaded,
            numSeeds,
            numLeechs: qbitTorrent.num_leechs,
            status: 'checking'
          })
          .where(eq(downloads.id, dl.id))
      )
      etaSamples.push(
        etaSample(dl, 'checking', {
          sizeBytes: qbitTorrent.size,
          downloadedBytes: qbitTorrent.downloaded,
          numSeeds,
          downloadSpeed: 0
        })
      )
      result.synced++
      continue
    }

    const isComplete =
      qbitTorrent.size > 0 &&
      (qbitTorrent.completion_on > 0 ||
        qbitTorrent.downloaded >= qbitTorrent.size ||
        progressPct >= 99.9 ||
        COMPLETED_STATES.has(qbitTorrent.state))

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
      etaSamples.push(
        etaSample(dl, 'completed', {
          sizeBytes: qbitTorrent.size,
          downloadedBytes: qbitTorrent.downloaded,
          numSeeds: swarmSeedCount(qbitTorrent),
          downloadSpeed: 0
        })
      )
      void organizeAfterComplete(
        {
          id: dl.id,
          savePath: dl.savePath,
          torrentName: qbitTorrent.name || dl.torrentName,
          label: dl.label,
          tmdbId: dl.tmdbId,
          mediaType: dl.mediaType,
          resolution: dl.resolution
        },
        qbitTorrent.hash
      )
      // The ready notification is sent by notifyJellyfinIfNeeded once the prep
      // gates open (countdown elapsed and import settled).
    } else {
      const isPaused = PAUSED_DOWNLOAD_STATES.has(qbitTorrent.state)
      const nextStatus = isPaused ? 'paused' : 'downloading'
      if (dl.status !== nextStatus) {
        log.info(
          `status changed: ${dl.status} -> ${nextStatus}: id=${dl.id} hash=${qbitTorrent.hash} state=${qbitTorrent.state}`
        )
      }
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
            status: nextStatus
          })
          .where(eq(downloads.id, dl.id))
      )
      etaSamples.push(
        etaSample(dl, nextStatus, {
          sizeBytes: qbitTorrent.size,
          downloadedBytes: qbitTorrent.downloaded,
          numSeeds,
          downloadSpeed: isPaused ? 0 : qbitTorrent.dlspeed
        })
      )
    }

    result.synced++
  }

  // One poll with the fresh snapshot: all rows of this sync share the same
  // sample timestamp, so the speed window is not distorted by per-row drift.
  trackServerEta(etaSamples, etaSampledAt)

  return result
}

// Single sender of the ready notification: Jellyfin, Discord and push are all
// dispatched here, once the countdown has elapsed and the library import has
// settled. The completion path in syncTorrentStatus never notifies, so a
// download that is still being imported cannot announce itself as ready.
export async function notifyJellyfinIfNeeded(): Promise<void> {
  if (notifySweepRunning) return
  notifySweepRunning = true
  try {
    await notifyJellyfinIfNeededOnce()
  } finally {
    notifySweepRunning = false
  }
}

async function notifyJellyfinIfNeededOnce(): Promise<void> {
  const db = await useDbAsync()
  const jellyfin = useJellyfin()

  const countdownEnabled = await isPrepCountdownEnabled()
  const prepDelaySeconds = await getPrepDelaySeconds()

  const savePathMap = getLibraryRoots()

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

    // The wait starts when the import settles, not when the download finishes.
    // Older rows have no start marker yet, so they fall back to completedAt.
    const waitStart = dl.prepStartedAt ?? dl.completedAt
    const elapsed = waitStart === null ? Number.POSITIVE_INFINITY : (Date.now() - new Date(waitStart).getTime()) / 1000
    const prepDelay = countdownEnabled ? prepDelaySeconds : 0

    // A waiting import is part of "preparation": notifying now would point
    // Jellyfin at a folder that does not exist yet. Gating on the row alone is
    // fail-closed - no config read that could fail open. Categories without an
    // import (games/books/music) are unaffected.
    const importState = importNotificationState(dl)

    if (elapsed >= prepDelay && importState !== 'wait') {
      if (importState === 'ready') {
        if (jellyfin !== null) {
          const targetPath = savePathMap[dl.savePath]
          if (targetPath !== undefined) {
            // Point Jellyfin at the organized file folder when the import ran,
            // otherwise fall back to the library root.
            const notifyPath =
              typeof dl.organizedPath === 'string' && dl.organizedPath !== ''
                ? join(targetPath, dirname(dl.organizedPath))
                : targetPath
            await jellyfin.notifyMediaUpdated([notifyPath]).catch(() => {})
            needsCacheInvalidation = true
          }
        }
        // Sent here even with the countdown disabled: the import gate is the
        // reason the notification waited, so the countdown flag only controls
        // the delay, never who sends.
        void notifyDiscord(dl, userMap, discordIdMap)
        void notifyDownloadComplete(
          dl.userId,
          dl.id,
          dl.mediaType,
          dl.label || dl.torrentName || 'Download',
          dl.posterUrl,
          dl.sizeBytes,
          dl.savePath,
          dl.tmdbId,
          dl.torrentName
        )
      } else {
        log.info(`skipping ready notification for failed import: id=${dl.id} status=${dl.organizeStatus}`)
      }
      await dbRun(db.update(downloads).set({ notifiedAt: new Date().toISOString() }).where(eq(downloads.id, dl.id)))
    }
  }

  if (needsCacheInvalidation && jellyfin !== null) {
    jellyfin.invalidateLibraryCache()
  }
}
