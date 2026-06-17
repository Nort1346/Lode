import { downloads } from '../../database/schema'
import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getMovieDetails, getTvShowDetails, getImageUrl } from '../../utils/tmdb'

interface AddTorrentBody {
  magnetLink?: string
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

  const body = await readBody<AddTorrentBody>(event)
  const rawMagnetLink = body.magnetLink ?? ''
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

  if (!hasMagnet && !hasFile) {
    throw createError({ statusCode: 400, statusMessage: 'Magnet link or .torrent file is required' })
  }

  if (hasMagnet && !magnetLink.startsWith('magnet:')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid magnet link' })
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

  const db = useDb()
  const config = useRuntimeConfig()

  if (session.user.role !== 'admin') {
    const userDownloads = db
      .select()
      .from(downloads)
      .where(and(eq(downloads.userId, session.user.id), eq(downloads.status, 'downloading')))
      .all()

    if (userDownloads.length >= session.user.activeTorrentLimit) {
      throw createError({
        statusCode: 429,
        statusMessage: `Active torrent limit reached (${session.user.activeTorrentLimit})`
      })
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todayAll = db
      .select()
      .from(downloads)
      .where(eq(downloads.userId, session.user.id))
      .all()
      .filter((d) => new Date(d.createdAt) >= todayStart && d.status !== 'failed' && d.status !== 'removed')

    if (todayAll.length >= session.user.dailyDownloadLimit) {
      throw createError({
        statusCode: 429,
        statusMessage: `Daily download limit reached (${session.user.dailyDownloadLimit})`
      })
    }
  }

  const savePathMap: Record<SavePathKey, string> = {
    movies: config.savePathMovies,
    series: config.savePathSeries,
    games: config.savePathGames,
    books: config.savePathBooks,
    music: config.savePathMusic
  }

  const targetPath = savePathMap[savePath as SavePathKey]
  if (!targetPath) {
    throw createError({ statusCode: 500, statusMessage: 'Save path not configured' })
  }

  const qui = useQui()

  const dlTag = `dl-${randomUUID().slice(0, 8)}`
  let torrent
  let storedMagnetLink: string

  if (hasFile) {
    const fileBuffer = Buffer.from(torrentFileBase64, 'base64')
    storedMagnetLink = `file:${fileName}`
    torrent = await qui.addTorrentFile(fileBuffer, fileName, targetPath, savePath, dlTag)
  } else {
    storedMagnetLink = magnetLink
    torrent = await qui.addTorrent(magnetLink, targetPath, savePath, dlTag)
  }

  if (torrent !== null) {
    const maxSizeBytes = session.user.maxTorrentSizeGb * 1024 * 1024 * 1024
    if (torrent.size > maxSizeBytes) {
      await qui.deleteTorrent(torrent.hash, true).catch(() => {})
      throw createError({
        statusCode: 413,
        statusMessage: `Torrent too large (${(torrent.size / (1024 * 1024 * 1024)).toFixed(1)} GB). Limit: ${session.user.maxTorrentSizeGb} GB`
      })
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
      // ignore — poster is optional
    }
  }

  const id = randomUUID()
  db.insert(downloads)
    .values({
      id,
      userId: session.user.id,
      label: label ?? '',
      magnetLink: storedMagnetLink,
      savePath: savePath as SavePathKey,
      status: torrent !== null ? 'downloading' : 'pending',
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

  if (torrent === null) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Torrent was sent to qBittorrent but could not be confirmed. It may appear shortly.'
    })
  }

  logActivity(event, {
    action: 'torrent_add',
    userId: session.user.id,
    username: session.user.username,
    details: JSON.stringify({
      name: torrent?.name ?? 'unknown',
      label: label ?? '',
      savePath,
      sizeBytes: torrent?.size ?? 0
    })
  })

  return { success: true, id, torrent }
})
