import { downloads } from '../../database/schema'
import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = await readBody(event)
  const { magnetLink, savePath, label } = body

  if (!magnetLink) {
    throw createError({ statusCode: 400, statusMessage: 'Magnet link is required' })
  }

  if (!magnetLink.startsWith('magnet:')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid magnet link' })
  }

  if (!savePath || !['movies', 'series', 'games', 'music', 'books'].includes(savePath)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid save path is required (movies, series, games, music, books)' })
  }

  const db = useDb()
  const config = useRuntimeConfig()

  const userDownloads = db.select().from(downloads)
    .where(and(
      eq(downloads.userId, session.user.id),
      eq(downloads.status, 'downloading')
    )).all()

  if (userDownloads.length >= session.user.activeTorrentLimit) {
    throw createError({ statusCode: 429, statusMessage: `Active torrent limit reached (${session.user.activeTorrentLimit})` })
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todayDownloads = db.select().from(downloads)
    .where(and(
      eq(downloads.userId, session.user.id),
      eq(downloads.status, 'completed')
    )).all()
    .filter(d => new Date(d.createdAt) >= todayStart)

  if (todayDownloads.length >= session.user.dailyDownloadLimit) {
    throw createError({ statusCode: 429, statusMessage: `Daily download limit reached (${session.user.dailyDownloadLimit})` })
  }

  const savePathMap: Record<string, string> = {
    movies: config.savePathMovies,
    series: config.savePathSeries,
    games: config.savePathGames,
    books: config.savePathBooks,
    music: config.savePathMusic
  }

  const targetPath = savePathMap[savePath]
  if (!targetPath) {
    throw createError({ statusCode: 500, statusMessage: 'Save path not configured' })
  }

  const qui = useQui()
  const torrent = await qui.addTorrent(magnetLink, targetPath, savePath, session.user.username)

  const id = randomUUID()
  db.insert(downloads).values({
    id,
    userId: session.user.id,
    label: label || '',
    magnetLink,
    savePath,
    status: torrent ? 'downloading' : 'pending',
    torrentHash: torrent?.hash || null,
    progress: torrent ? torrent.progress * 100 : 0,
    etaSeconds: torrent?.eta || 0,
    downloadSpeed: torrent?.dlspeed || 0,
    uploadSpeed: torrent?.upspeed || 0,
    sizeBytes: torrent?.size || 0,
    downloadedBytes: torrent?.downloaded || 0,
    createdAt: new Date().toISOString()
  }).run()

  return { success: true, id, torrent }
})
