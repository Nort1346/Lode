import { downloads } from '../../database/schema'
import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

interface DownloadBody {
  magnetLink: string
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
  const rawMagnetLink = body.magnetLink
  const savePath = body.savePath
  const label = body.label

  let torrentUrl = rawMagnetLink
  if (torrentUrl?.startsWith('magnet://')) {
    torrentUrl = torrentUrl.replace(/^magnet:\/\//, 'magnet:')
  }

  if (!torrentUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Magnet link is required' })
  }

  if (!torrentUrl.startsWith('magnet:') && !torrentUrl.startsWith('http://') && !torrentUrl.startsWith('https://')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid magnet or torrent URL' })
  }

  if (!savePath || !SAVE_PATH_KEYS.includes(savePath as SavePathKey)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid save path is required (movies, series, games, music, books)'
    })
  }

  const db = useDb()
  const config = useRuntimeConfig()

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
  const torrent = await qui.addTorrent(torrentUrl, targetPath, savePath, session.user.username)

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
      magnetLink: torrentUrl,
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
