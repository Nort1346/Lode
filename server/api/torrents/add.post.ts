import { downloads } from '#server/database/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { useDbAsync, dbGet, dbAll, dbRun } from '#server/utils/db'
import { getMovieDetails, getTvShowDetails, getImageUrl } from '#server/utils/tmdb'
import { getFreshUser } from '#server/utils/user'
import { checkAllDisks, isDiskCheckEnabled, getDiskMinFreeGb } from '#server/utils/disk'
import { withTorrentAddLock, checkCooldown, setCooldown } from '#server/utils/mutex'
import { normalizeEta } from '#server/utils/torrents/eta'
import { parseTorrentTitle } from '#server/utils/torrents/torrent-ranker'
import { computeTorrentInfoHash } from '#server/utils/torrents/info-hash'
import { extractMagnetHash } from '#server/utils/clients/qbittorrent'
import { createLogger } from '#server/utils/logger'
import { assertExternalUrl } from '#server/utils/url-validate'
import { DEDUP_MATCH_STATUSES, SAVE_PATH_KEYS, type AddTorrentBody, type SavePathKey } from '#server/types/torrent'

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

  const userId = session.user.id
  const userRole = session.user.role
  const username = session.user.username

  return await withTorrentAddLock(async () => {
    if (userRole !== 'admin') {
      const userDownloads = await dbAll(
        db
          .select()
          .from(downloads)
          .where(and(eq(downloads.userId, userId), eq(downloads.status, 'downloading')))
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

    // Duplicate check: reject adding a torrent the user is already downloading
    let infoHash: string | null = null
    if (hasFile && !hasDownloadUrl) {
      try {
        infoHash = computeTorrentInfoHash(Buffer.from(torrentFileBase64, 'base64'))
      } catch (err) {
        log.warn(`info-hash computation failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    const preHash = hasMagnet ? extractMagnetHash(magnetLink) : hasFile ? infoHash : null
    if (preHash !== null) {
      const existingActive = await dbGet(
        db
          .select()
          .from(downloads)
          .where(
            and(
              eq(downloads.userId, userId),
              eq(downloads.torrentHash, preHash),
              inArray(downloads.status, DEDUP_MATCH_STATUSES)
            )
          )
      )
      if (existingActive !== undefined) {
        log.info(`already active: hash=${preHash} id=${existingActive.id}`)
        return { already: true, id: existingActive.id }
      }
    }

    // Duplicate check by stored link (covers rows with a null hash, e.g. same Prowlarr URL)
    const storedValue = hasDownloadUrl ? `download:${downloadUrl}` : hasFile ? `file:${fileName}` : magnetLink
    const existingByLink = await dbGet(
      db
        .select()
        .from(downloads)
        .where(
          and(
            eq(downloads.userId, userId),
            eq(downloads.magnetLink, storedValue),
            inArray(downloads.status, DEDUP_MATCH_STATUSES)
          )
        )
    )
    if (existingByLink !== undefined) {
      log.info(`already active by link: id=${existingByLink.id}`)
      return { already: true, id: existingByLink.id }
    }

    const qbit = useQBittorrent()

    const dlTag = `dl-${randomUUID().slice(0, 8)}`
    let torrent
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
      torrent = await qbit.addTorrent(
        downloadUrl,
        targetPath,
        savePath,
        dlTag,
        hasMagnet ? extractMagnetHash(magnetLink) : null
      )
    } else if (hasFile) {
      const fileBuffer = Buffer.from(torrentFileBase64, 'base64')
      storedMagnetLink = `file:${fileName}`
      setCooldown(userId)
      torrent = await qbit.addTorrentFile(fileBuffer, fileName, targetPath, savePath, dlTag, infoHash)
    } else {
      storedMagnetLink = magnetLink
      setCooldown(userId)
      torrent = await qbit.addTorrent(magnetLink, targetPath, savePath, dlTag)
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

      if (torrent.size > 0 && (await isDiskCheckEnabled())) {
        const disks = (config.disks as string).split(',').filter((d) => d.trim().length > 0)
        if (disks.length > 0) {
          const allStatuses = await checkAllDisks(disks, await getDiskMinFreeGb())
          const lowDisk = allStatuses.find((d) => {
            if (!d.available) return true
            return torrent.size > d.freeBytes
          })
          if (lowDisk !== undefined) {
            await qbit.deleteTorrent(torrent.hash, true).catch(() => {})
            throw createError({
              statusCode: 507,
              statusMessage: `Torrent too large for disk (${formatSize(torrent.size)}). Free: ${lowDisk.freeFormatted}${userRole === 'admin' ? ` on ${lowDisk.path}` : ''}`
            })
          }
        }
      }
    }

    if (torrent !== null && userRole === 'admin') {
      await qbit.moveToTop([torrent.hash]).catch(() => {})
    }

    // Post-add duplicate guard: qBittorrent may have returned an existing torrent (409)
    if (torrent !== null) {
      const existingActive = await dbGet(
        db
          .select()
          .from(downloads)
          .where(
            and(
              eq(downloads.userId, userId),
              eq(downloads.torrentHash, torrent.hash),
              inArray(downloads.status, DEDUP_MATCH_STATUSES)
            )
          )
      )
      if (existingActive !== undefined) {
        log.info(`already active after add: hash=${torrent.hash} id=${existingActive.id}`)
        return { already: true, id: existingActive.id }
      }

      // Tag fallback: catches the 409-existing case where the stored row has a null hash
      const torrentTags = torrent.tags
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      if (torrentTags.length > 0) {
        const tagRows = await dbAll(
          db
            .select()
            .from(downloads)
            .where(
              and(
                eq(downloads.userId, userId),
                inArray(downloads.qbitTag, torrentTags),
                inArray(downloads.status, DEDUP_MATCH_STATUSES)
              )
            )
        )
        const tagRow = tagRows[0]
        if (tagRow !== undefined) {
          log.info(`already active after add (tag): tag="${torrent.tags}" id=${tagRow.id}`)
          return { already: true, id: tagRow.id }
        }
      }
    }

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
