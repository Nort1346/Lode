import { downloads } from '#server/database/schema'
import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getMovieDetails, getTvShowDetails, getImageUrl } from '#server/utils/tmdb'
import { getFreshUser } from '#server/utils/user'
import { checkAllDisks, isDiskCheckEnabled, getDiskMinFreeGb } from '#server/utils/disk'
import { withTorrentAddLock, checkCooldown, setCooldown } from '#server/utils/mutex'
import { createLogger } from '#server/utils/logger'

const log = createLogger('Add')

interface AddTorrentBody {
  magnetLink?: string
  downloadUrl?: string
  torrentFile?: string
  fileName?: string
  savePath: string
  label?: string
  tmdbId?: number
  mediaType?: string
}

const SAVE_PATH_KEYS = ['movies', 'series', 'games', 'music', 'books'] as const
type SavePathKey = (typeof SAVE_PATH_KEYS)[number]

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const freshUser = getFreshUser(session.user.id)
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
    downloadUrl = rawDownloadUrl
  }

  if (hasFile) {
    if (fileName.length === 0 || !fileName.endsWith('.torrent')) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid .torrent file' })
    }
    if (torrentFileBase64.length > 7 * 1024 * 1024) {
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
  const db = useDb()

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

  setCooldown(userId)

  return await withTorrentAddLock(async () => {
    if (userRole !== 'admin') {
      db.transaction(() => {
        const userDownloads = db
          .select()
          .from(downloads)
          .where(and(eq(downloads.userId, userId), eq(downloads.status, 'downloading')))
          .all()

        if (userDownloads.length >= freshUser.activeTorrentLimit) {
          throw createError({
            statusCode: 429,
            statusMessage: `Active torrent limit reached (${freshUser.activeTorrentLimit})`
          })
        }

        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)

        const todayAll = db
          .select()
          .from(downloads)
          .where(eq(downloads.userId, userId))
          .all()
          .filter((d) => new Date(d.createdAt) >= todayStart && d.status !== 'failed' && d.status !== 'removed')

        if (todayAll.length >= freshUser.dailyDownloadLimit) {
          throw createError({
            statusCode: 429,
            statusMessage: `Daily download limit reached (${freshUser.dailyDownloadLimit})`
          })
        }
      })
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
            log.info('[Add] URL redirects to magnet: - valid torrent URL')
          } else {
            log.info(`[Add] URL redirects to ${location.substring(0, 80)} - passing to qBittorrent`)
          }
        } else if (res.ok) {
          const contentType = res.headers.get('content-type') ?? ''
          if (contentType.includes('text/html')) {
            isHtml = true
          }
        } else {
          log.warn(`[Add] URL returned ${res.status}, passing to qBittorrent anyway`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn(`[Add] URL fetch failed, passing to qBittorrent anyway: ${msg}`)
      }
      if (isHtml) {
        throw createError({ statusCode: 400, statusMessage: 'URL returned HTML, not a torrent file' })
      }

      storedMagnetLink = `download:${downloadUrl}`
      torrent = await qbit.addTorrent(downloadUrl, targetPath, savePath, dlTag)
    } else if (hasFile) {
      const fileBuffer = Buffer.from(torrentFileBase64, 'base64')
      storedMagnetLink = `file:${fileName}`
      torrent = await qbit.addTorrentFile(fileBuffer, fileName, targetPath, savePath, dlTag)
    } else {
      storedMagnetLink = magnetLink
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

      if (torrent.size > 0 && isDiskCheckEnabled()) {
        const disks = (config.disks as string).split(',').filter((d) => d.trim().length > 0)
        if (disks.length > 0) {
          const allStatuses = checkAllDisks(disks, getDiskMinFreeGb())
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
    db.insert(downloads)
      .values({
        id,
        userId,
        label: label ?? '',
        torrentName: torrent?.name ?? '',
        magnetLink: storedMagnetLink,
        savePath: savePath as SavePathKey,
        status: 'downloading',
        torrentHash: torrent?.hash ?? null,
        progress: torrent !== null ? torrent.progress * 100 : 0,
        etaSeconds: torrent?.eta ?? 0,
        downloadSpeed: torrent?.dlspeed ?? 0,
        uploadSpeed: torrent?.upspeed ?? 0,
        sizeBytes: torrent?.size ?? 0,
        downloadedBytes: torrent?.downloaded ?? 0,
        createdAt: new Date().toISOString(),
        tmdbId,
        mediaType,
        posterUrl
      })
      .run()

    logActivity(event, {
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
