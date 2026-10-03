import { downloads } from '#server/database/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { useDbAsync, dbAll, dbRun } from '#server/utils/db'
import { getMovieDetails, getTvShowDetails, getImageUrl } from '#server/utils/tmdb'
import { getFreshUser } from '#server/utils/user'
import { checkTargetDiskForDownload, findTargetDisk, isDiskCheckEnabled, getDiskMinFreeGb } from '#server/utils/disk'
import { withTorrentAddLock, checkCooldown, setCooldown } from '#server/utils/mutex'
import { normalizeEta } from '#server/utils/torrents/eta'
import { swarmSeedCount } from '#server/utils/torrents/swarm'
import { applySeedingPolicy } from '#server/utils/torrents/seeding'
import { parseTorrentTitle } from '#server/utils/torrents/torrent-ranker'
import { computeTorrentInfoHashes, computeTorrentTotalSize } from '#server/utils/torrents/info-hash'
import { extractMagnetHash, extractMagnetInfoHashes } from '#server/utils/clients/qbittorrent'
import { createLogger } from '#server/utils/logger'
import { assertExternalUrl } from '#server/utils/url-validate'
import {
  SAVE_PATH_KEYS,
  type AddTorrentBody,
  type MagnetInfoHashes,
  type QBitTorrent,
  type SavePathKey,
  type TorrentAddOutcome
} from '#server/types/torrent'

const log = createLogger('Add')

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const freshUser = await getFreshUser(session.user.id)
  if (freshUser === undefined) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  if (session.user.role !== 'admin' && !freshUser.canSubmit) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to submit torrents' })
  }

  const cooldown = checkCooldown(session.user.id)
  if (!cooldown.ok) {
    throw createError({
      statusCode: 429,
      statusMessage: `Please wait ${Math.ceil(cooldown.remainingMs / 1000)}s before adding another torrent`
    })
  }

  const body = await readBody<AddTorrentBody>(event)
  const rawMagnetLink = body.magnetLink ?? ''
  const rawDownloadUrl = body.downloadUrl ?? ''
  const torrentFileBase64 = body.torrentFile ?? ''
  const fileName = body.fileName ?? ''
  const savePath = body.savePath
  const label = body.label ?? ''
  const tmdbId = body.tmdbId ?? null
  const rawMediaType = body.mediaType
  const mediaType = rawMediaType === 'movie' || rawMediaType === 'tv' ? rawMediaType : null
  const magnetLink = rawMagnetLink.replace(/^magnet:\/\//, 'magnet:')

  const hasMagnet = magnetLink.length > 0
  const hasFile = torrentFileBase64.length > 0
  const hasDownloadUrl = rawDownloadUrl.length > 0

  if (!hasMagnet && !hasFile && !hasDownloadUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Magnet link, torrent URL, or .torrent file is required' })
  }

  if (hasMagnet && !magnetLink.startsWith('magnet:')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid magnet link' })
  }

  let downloadUrl = ''
  if (hasDownloadUrl) {
    if (!rawDownloadUrl.startsWith('http://') && !rawDownloadUrl.startsWith('https://')) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid torrent URL' })
    }
    assertExternalUrl(rawDownloadUrl)
    downloadUrl = rawDownloadUrl
  }

  if (hasFile) {
    if (fileName.length === 0 || !fileName.endsWith('.torrent')) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid .torrent file' })
    }
    if (torrentFileBase64.length > 5 * 1024 * 1024) {
      throw createError({ statusCode: 413, statusMessage: 'File too large (max 5MB)' })
    }
  }

  if (!savePath || !SAVE_PATH_KEYS.includes(savePath as SavePathKey)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid save path is required (movies, series, games, music, books)'
    })
  }

  const config = useRuntimeConfig()
  const db = await useDbAsync()

  const savePathMap: Record<SavePathKey, string> = {
    movies: config.savePathMovies,
    series: config.savePathSeries,
    games: config.savePathGames,
    books: config.savePathBooks,
    music: config.savePathMusic
  }

  const targetPath = savePathMap[savePath as SavePathKey]
  if (!targetPath) {
    throw createError({ statusCode: 400, statusMessage: `Category "${savePath}" is not configured` })
  }

  const disks = (config.disks as string)
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d.length > 0)

  const userId = session.user.id
  const userRole = session.user.role
  const username = session.user.username

  return await withTorrentAddLock(async () => {
    if (userRole !== 'admin') {
      const userDownloads = await dbAll(
        db
          .select()
          .from(downloads)
          .where(and(eq(downloads.userId, userId), inArray(downloads.status, ['checking', 'downloading', 'paused'])))
      )

      if (userDownloads.length >= freshUser.activeTorrentLimit) {
        throw createError({
          statusCode: 429,
          statusMessage: `Active torrent limit reached (${freshUser.activeTorrentLimit})`
        })
      }

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const todayAll = (await dbAll(db.select().from(downloads).where(eq(downloads.userId, userId)))).filter(
        (d) => new Date(d.createdAt) >= todayStart && d.status !== 'failed' && d.status !== 'removed'
      )

      if (todayAll.length >= freshUser.dailyDownloadLimit) {
        throw createError({
          statusCode: 429,
          statusMessage: `Daily download limit reached (${freshUser.dailyDownloadLimit})`
        })
      }
    }

    // Hashes are computed up front for the live qBittorrent pre-check in
    // addTorrent/addTorrentFile. Duplicate detection is live-only
    const fileBuffer = hasFile && !hasDownloadUrl ? Buffer.from(torrentFileBase64, 'base64') : null
    let infoHash: string | null = null
    let fileHashes: MagnetInfoHashes = { v1: null, v2: null }
    let preAddSizeBytes = 0
    if (fileBuffer !== null) {
      try {
        fileHashes = computeTorrentInfoHashes(fileBuffer)
        infoHash = fileHashes.v1
      } catch (err) {
        log.warn(`info-hash computation failed: ${err instanceof Error ? err.message : String(err)}`)
      }
      preAddSizeBytes = computeTorrentTotalSize(fileBuffer) ?? 0
    }
    const magnetHashes = hasMagnet ? extractMagnetInfoHashes(magnetLink) : null

    const preDisk = await checkTargetDiskForDownload(disks, targetPath, preAddSizeBytes)
    if (preDisk !== null && (!preDisk.status.available || !preDisk.status.hasEnoughSpace)) {
      log.warn(
        `PRE-ADD DISK BLOCK - ${preDisk.status.path}: ${preDisk.status.available ? preDisk.status.freeFormatted + ' free' : 'unavailable'}, required=${formatSize(preAddSizeBytes)}, minFree=${preDisk.minFreeGb}GB`
      )
      throw createError({
        statusCode: 507,
        statusMessage: `Not enough disk space (${formatSize(preAddSizeBytes)} torrent). Free: ${preDisk.status.freeFormatted}${userRole === 'admin' ? ` on ${preDisk.status.path}` : ''}, minimum after download: ${preDisk.minFreeGb} GB`
      })
    }

    const qbit = useQBittorrent()

    const dlTag = `dl-${randomUUID().slice(0, 8)}`
    let torrent: QBitTorrent | null
    let storedMagnetLink: string

    if (hasDownloadUrl) {
      let isHtml = false
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000)
        const res = await fetch(downloadUrl, { method: 'GET', signal: controller.signal, redirect: 'manual' })
        clearTimeout(timeout)

        const location = res.headers.get('location') ?? ''
        if (res.status >= 300 && res.status < 400) {
          if (location.startsWith('magnet:')) {
            log.info('URL redirects to magnet: - valid torrent URL')
          } else {
            log.info(`URL redirects to ${location.substring(0, 80)} - passing to qBittorrent`)
          }
        } else if (res.ok) {
          const contentType = res.headers.get('content-type') ?? ''
          if (contentType.includes('text/html')) {
            isHtml = true
          }
        } else {
          log.warn(`URL returned ${res.status}, passing to qBittorrent anyway`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn(`URL fetch failed, passing to qBittorrent anyway: ${msg}`)
      }
      if (isHtml) {
        throw createError({ statusCode: 400, statusMessage: 'URL returned HTML, not a torrent file' })
      }

      setCooldown(userId)
      storedMagnetLink = `download:${downloadUrl}`
      let outcome: TorrentAddOutcome
      try {
        outcome = await qbit.addTorrent(downloadUrl, targetPath, savePath, dlTag, magnetHashes)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('already exists')) {
          log.warn(`torrent already exists in qBittorrent: ${msg}`)
          throw createError({ statusCode: 409, statusMessage: 'Torrent already exists in qBittorrent' })
        }
        log.error(`qBittorrent error: ${msg}`)
        throw createError({ statusCode: 502, statusMessage: `qBittorrent error: ${msg}` })
      }
      if (outcome.status === 'existing') {
        log.info(`torrent already in qBittorrent: hash=${outcome.torrent.hash} complete=${outcome.complete}`)
        return outcome.complete
          ? { alreadyComplete: true, name: outcome.torrent.name }
          : { alreadyDownloading: true, name: outcome.torrent.name }
      }
      torrent = outcome.torrent
    } else if (hasFile && fileBuffer !== null) {
      storedMagnetLink = `file:${fileName}`
      setCooldown(userId)
      let outcome: TorrentAddOutcome
      try {
        outcome = await qbit.addTorrentFile(fileBuffer, fileName, targetPath, savePath, dlTag, fileHashes)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('already exists')) {
          log.warn(`torrent already exists in qBittorrent: ${msg}`)
          throw createError({ statusCode: 409, statusMessage: 'Torrent already exists in qBittorrent' })
        }
        log.error(`qBittorrent error: ${msg}`)
        throw createError({ statusCode: 502, statusMessage: `qBittorrent error: ${msg}` })
      }
      if (outcome.status === 'existing') {
        log.info(`torrent already in qBittorrent: hash=${outcome.torrent.hash} complete=${outcome.complete}`)
        return outcome.complete
          ? { alreadyComplete: true, name: outcome.torrent.name }
          : { alreadyDownloading: true, name: outcome.torrent.name }
      }
      torrent = outcome.torrent
    } else {
      storedMagnetLink = magnetLink
      setCooldown(userId)
      let outcome: TorrentAddOutcome
      try {
        outcome = await qbit.addTorrent(magnetLink, targetPath, savePath, dlTag)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('already exists')) {
          log.warn(`torrent already exists in qBittorrent: ${msg}`)
          throw createError({ statusCode: 409, statusMessage: 'Torrent already exists in qBittorrent' })
        }
        log.error(`qBittorrent error: ${msg}`)
        throw createError({ statusCode: 502, statusMessage: `qBittorrent error: ${msg}` })
      }
      if (outcome.status === 'existing') {
        log.info(`torrent already in qBittorrent: hash=${outcome.torrent.hash} complete=${outcome.complete}`)
        return outcome.complete
          ? { alreadyComplete: true, name: outcome.torrent.name }
          : { alreadyDownloading: true, name: outcome.torrent.name }
      }
      torrent = outcome.torrent
    }

    if (torrent !== null) {
      await applySeedingPolicy(qbit, torrent.hash).catch(() => {})
    }

    if (torrent !== null) {
      const maxSizeBytes = freshUser.maxTorrentSizeGb * 1024 * 1024 * 1024
      if (torrent.size > maxSizeBytes) {
        await qbit.deleteTorrent(torrent.hash, true).catch(() => {})
        throw createError({
          statusCode: 413,
          statusMessage: `Torrent too large (${(torrent.size / (1024 * 1024 * 1024)).toFixed(1)} GB). Limit: ${freshUser.maxTorrentSizeGb} GB`
        })
      }

      if (torrent.size > 0 && disks.length > 0 && (await isDiskCheckEnabled())) {
        const minFreeGb = await getDiskMinFreeGb()
        const targetDisk = await findTargetDisk(disks, targetPath, minFreeGb, torrent.size)
        if (!targetDisk.available || !targetDisk.hasEnoughSpace) {
          log.warn(
            `POST-ADD DISK BLOCK - ${targetDisk.path}: ${targetDisk.available ? targetDisk.freeFormatted + ' free' : 'unavailable'}, torrent=${formatSize(torrent.size)}, minFree=${minFreeGb}GB`
          )
          try {
            await qbit.deleteTorrent(torrent.hash, true)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            log.error(`POST-ADD DISK DELETE FAILED - ${targetDisk.path}: ${msg}`)
            throw createError({
              statusCode: 502,
              statusMessage:
                'Not enough disk space and automatic torrent removal failed. Remove the torrent manually from qBittorrent.'
            })
          }
          throw createError({
            statusCode: 507,
            statusMessage: `Not enough disk space (${formatSize(torrent.size)} torrent). Free: ${targetDisk.freeFormatted}${userRole === 'admin' ? ` on ${targetDisk.path}` : ''}, minimum after download: ${minFreeGb} GB`
          })
        }
      }
    }

    if (torrent !== null && userRole === 'admin') {
      await qbit.moveToTop([torrent.hash]).catch(() => {})
    }

    // A fresh row is always inserted below, even when older rows for the same
    // hash exist: completed history is never rewritten and never blocks.

    let posterUrl: string | null = null
    if (tmdbId !== null && mediaType !== null) {
      try {
        if (mediaType === 'movie') {
          const movie = await getMovieDetails(tmdbId)
          posterUrl = getImageUrl(movie.poster_path, 'w185')
        } else {
          const show = await getTvShowDetails(tmdbId)
          posterUrl = getImageUrl(show.poster_path, 'w185')
        }
      } catch {
        // ignore - poster is optional
      }
    }

    const id = randomUUID()
    await dbRun(
      db.insert(downloads).values({
        id,
        userId,
        label: label ?? '',
        torrentName: torrent?.name ?? '',
        magnetLink: storedMagnetLink,
        savePath: savePath as SavePathKey,
        status: 'downloading',
        torrentHash: torrent?.hash ?? infoHash ?? extractMagnetHash(storedMagnetLink),
        progress: torrent !== null ? torrent.progress * 100 : 0,
        etaSeconds: normalizeEta(torrent?.eta ?? 0),
        downloadSpeed: torrent?.dlspeed ?? 0,
        uploadSpeed: torrent?.upspeed ?? 0,
        sizeBytes: torrent?.size ?? 0,
        downloadedBytes: torrent?.downloaded ?? 0,
        // -1 = seed count unknown until qBittorrent's first announce completes
        numSeeds: torrent !== null ? swarmSeedCount(torrent) : -1,
        numLeechs: torrent?.num_leechs ?? -1,
        createdAt: new Date().toISOString(),
        tmdbId,
        mediaType,
        posterUrl,
        resolution: torrent !== null ? parseTorrentTitle(torrent.name).resolution : null,
        qbitTag: dlTag
      })
    )

    await logActivity(event, {
      action: 'torrent_add',
      userId,
      username,
      details: JSON.stringify({
        name: torrent?.name ?? 'unknown',
        label: label ?? '',
        savePath,
        sizeBytes: torrent?.size ?? 0
      })
    })

    return { success: true, id, torrent }
  })
})
