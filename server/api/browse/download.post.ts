import { downloads } from '../../database/schema'
import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { POLISH_TRACKERS, getTrackerCookieConfig } from '../../utils/prowlarr'

interface DownloadBody {
  magnetLink?: string
  downloadUrl?: string
  guid?: string
  indexer?: string
  label: string
  savePath: string
}

const SAVE_PATH_KEYS = ['movies', 'series', 'games', 'music', 'books'] as const
type SavePathKey = (typeof SAVE_PATH_KEYS)[number]

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = await readBody<DownloadBody>(event)
  const rawMagnetLink = body.magnetLink ?? ''
  const downloadUrl = body.downloadUrl ?? ''
  const guidUrl = body.guid ?? ''
  const indexer = body.indexer ?? ''
  const savePath = body.savePath
  const label = body.label

  const hasMagnet = rawMagnetLink.length > 0
  const hasDownloadUrl = downloadUrl.length > 0
  const hasGuid = guidUrl.length > 0
  const isPolishTracker = POLISH_TRACKERS.includes(indexer)

  if (!hasMagnet && !hasGuid && !hasDownloadUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Magnet link, download URL, or torrent file URL is required' })
  }

  let torrentUrl = hasDownloadUrl ? downloadUrl : rawMagnetLink
  if (torrentUrl.startsWith('magnet://')) {
    torrentUrl = torrentUrl.replace(/^magnet:\/\//, 'magnet:')
  }

  if (!torrentUrl.startsWith('magnet:') && !torrentUrl.startsWith('http://') && !torrentUrl.startsWith('https://')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid magnet link or torrent URL' })
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

  if (hasGuid && isPolishTracker) {
    const trackerConfig = getTrackerCookieConfig(indexer, config)

    if (trackerConfig === null) {
      throw createError({ statusCode: 400, statusMessage: `Unknown tracker: ${indexer}` })
    }

    if (!trackerConfig.enabled) {
      throw createError({
        statusCode: 400,
        statusMessage: `Tracker ${indexer} is disabled. Set NUXT_TRACKER_${indexer === 'Devil-Torrents' ? 'DEVIL' : 'POLSKIE'}_ENABLED=true`
      })
    }

    if (trackerConfig.cookie.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: `No cookie configured for ${indexer}. Set NUXT_TRACKER_${indexer === 'Devil-Torrents' ? 'DEVIL' : 'POLSKIE'}_COOKIE`
      })
    }

    let fileResponse: Response
    try {
      fileResponse = await fetch(guidUrl, {
        headers: { Cookie: trackerConfig.cookie }
      })
    } catch {
      throw createError({ statusCode: 502, statusMessage: `Failed to connect to ${indexer}` })
    }

    if (!fileResponse.ok) {
      throw createError({ statusCode: 502, statusMessage: `${indexer} returned ${fileResponse.status}` })
    }

    const contentType = fileResponse.headers.get('content-type') ?? ''
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer())

    console.log(
      `[Download] ${indexer} response: contentType=${contentType}, size=${fileBuffer.length}, firstBytes=${fileBuffer.subarray(0, 20).toString('hex')}`
    )

    if (fileBuffer.length === 0) {
      throw createError({ statusCode: 401, statusMessage: `Empty response from ${indexer}. Cookie may be invalid.` })
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fileBuffer.length > 0 checked above
    const firstByte = fileBuffer[0]!
    if (firstByte === 0x3c) {
      const preview = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 200))
      console.log(`[Download] ${indexer} got HTML instead of torrent:`, preview)
      throw createError({
        statusCode: 401,
        statusMessage: `Invalid or expired cookie for ${indexer}. Update NUXT_TRACKER_*_COOKIE`
      })
    }

    if (firstByte !== 0x64) {
      throw createError({
        statusCode: 401,
        statusMessage: `Invalid response from ${indexer} (not a valid torrent file, first byte: 0x${firstByte.toString(16)})`
      })
    }

    const fileName = `${label.replace(/[^a-zA-Z0-9._-]/g, '_')}.torrent`

    storedMagnetLink = `guid:${guidUrl}`
    torrent = await qui.addTorrentFile(fileBuffer, fileName, targetPath, savePath, dlTag)
  } else {
    storedMagnetLink = hasDownloadUrl ? `download:${downloadUrl}` : torrentUrl
    torrent = await qui.addTorrent(torrentUrl, targetPath, savePath, dlTag)
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
      createdAt: new Date().toISOString()
    })
    .run()

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
