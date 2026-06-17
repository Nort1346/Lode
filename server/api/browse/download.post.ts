import { downloads } from '#server/database/schema'
import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { POLISH_TRACKERS, getTrackerCookieConfig } from '#server/utils/prowlarr'
import { gotScraping } from 'got-scraping'
import { getMovieDetails, getTvShowDetails, getImageUrl } from '#server/utils/tmdb'
import { checkAllDisks } from '#server/utils/disk'
import { formatSize } from '#server/utils/torrent-ranker'

interface DownloadBody {
  magnetLink?: string
  downloadUrl?: string
  guid?: string
  indexer?: string
  label: string
  savePath: string
  tmdbId?: number
  mediaType?: string
  torrentSize?: number
}

const SAVE_PATH_KEYS = ['movies', 'series', 'games', 'music', 'books'] as const
type SavePathKey = (typeof SAVE_PATH_KEYS)[number]

export default defineEventHandler(async (event) => {
  const t0 = Date.now()

  try {
    // ── 1: START ──────────────────────────────────────────────
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
    const tmdbId = body.tmdbId ?? null
    const rawMediaType = body.mediaType
    const mediaType = rawMediaType === 'movie' || rawMediaType === 'tv' ? rawMediaType : null

    const hasMagnet = rawMagnetLink.length > 0
    const hasDownloadUrl = downloadUrl.length > 0
    const hasGuid = guidUrl.length > 0
    const isPolishTracker = POLISH_TRACKERS.includes(indexer)

    console.log(
      `[Download:1:START] user=${session.user.username} role=${session.user.role} indexer="${indexer}" isPolish=${isPolishTracker} hasGuid=${hasGuid} hasMagnet=${hasMagnet} hasDownloadUrl=${hasDownloadUrl} label="${label}" savePath=${savePath}`
    )
    if (hasGuid) console.log(`[Download:1:START]   guid=${guidUrl}`)
    if (hasDownloadUrl) console.log(`[Download:1:START]   downloadUrl=${downloadUrl.substring(0, 120)}`)
    if (hasMagnet) console.log(`[Download:1:START]   magnet=${rawMagnetLink.substring(0, 80)}`)

    // ── 2: VALIDATE ───────────────────────────────────────────
    if (!hasMagnet && !hasGuid && !hasDownloadUrl) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Magnet link, download URL, or torrent file URL is required'
      })
    }

    let torrentUrl = hasDownloadUrl ? downloadUrl : rawMagnetLink
    if (torrentUrl.startsWith('magnet://')) {
      torrentUrl = torrentUrl.replace(/^magnet:\/\//, 'magnet:')
    }

    if (!torrentUrl.startsWith('magnet:') && !torrentUrl.startsWith('http://') && !torrentUrl.startsWith('https://')) {
      console.error(`[Download:2:VALIDATE] ✗ invalid torrentUrl prefix: ${torrentUrl.substring(0, 40)}`)
      throw createError({ statusCode: 400, statusMessage: 'Invalid magnet link or torrent URL' })
    }

    if (!savePath || !SAVE_PATH_KEYS.includes(savePath as SavePathKey)) {
      console.error(`[Download:2:VALIDATE] ✗ invalid savePath: ${savePath}`)
      throw createError({
        statusCode: 400,
        statusMessage: 'Valid save path is required (movies, series, games, music, books)'
      })
    }

    console.log(`[Download:2:VALIDATE] ✓ torrentUrl=${torrentUrl.substring(0, 100)}`)

    // ── 3: LIMITS ─────────────────────────────────────────────
    const db = useDb()
    const config = useRuntimeConfig()

    if (session.user.role !== 'admin') {
      const userDownloads = db
        .select()
        .from(downloads)
        .where(and(eq(downloads.userId, session.user.id), eq(downloads.status, 'downloading')))
        .all()

      console.log(`[Download:3:LIMITS] active=${userDownloads.length}/${session.user.activeTorrentLimit}`)

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

      console.log(`[Download:3:LIMITS] today=${todayAll.length}/${session.user.dailyDownloadLimit}`)

      if (todayAll.length >= session.user.dailyDownloadLimit) {
        throw createError({
          statusCode: 429,
          statusMessage: `Daily download limit reached (${session.user.dailyDownloadLimit})`
        })
      }

      if (isPolishTracker) {
        const todayPrivate = todayAll.filter((d) => d.magnetLink.startsWith('guid:'))
        console.log(`[Download:3:LIMITS] todayPrivate=${todayPrivate.length}/${session.user.privateTrackerLimit}`)
        if (todayPrivate.length >= session.user.privateTrackerLimit) {
          throw createError({
            statusCode: 429,
            statusMessage: `Private tracker daily limit reached (${session.user.privateTrackerLimit})`
          })
        }
      }
    } else {
      console.log(`[Download:3:LIMITS] admin — skipping all limits`)
    }

    // ── 4: SAVE PATH ──────────────────────────────────────────
    const savePathMap: Record<SavePathKey, string> = {
      movies: config.savePathMovies,
      series: config.savePathSeries,
      games: config.savePathGames,
      books: config.savePathBooks,
      music: config.savePathMusic
    }

    const targetPath = savePathMap[savePath as SavePathKey]
    if (!targetPath) {
      console.error(`[Download:4:PATH] ✗ no path for savePath=${savePath}`)
      throw createError({ statusCode: 500, statusMessage: 'Save path not configured' })
    }
    console.log(`[Download:4:PATH] savePath=${savePath} → ${targetPath}`)

    // ── 4b: DISK SPACE CHECK ─────────────────────────────────
    if (config.diskSpaceCheckEnabled === true) {
      const disks = (config.disks as string).split(',').filter((d) => d.trim().length > 0)
      if (disks.length > 0) {
        const torrentSize = body.torrentSize ?? 0
        const allStatuses = checkAllDisks(disks, config.minFreeSpaceGb as number)
        for (const disk of allStatuses) {
          if (disk.available) {
            console.log(
              `[Download:4b:DISK] ${disk.path}: ${disk.freeFormatted} free (${disk.usedPercent}% used)${torrentSize > 0 ? `, torrentSize=${formatSize(torrentSize)}` : ''}`
            )
          } else {
            console.log(`[Download:4b:DISK] ${disk.path}: unavailable`)
          }
        }
        const lowDisk = allStatuses.find((d) => {
          if (!d.available) return false
          const effectiveFree = d.freeBytes - torrentSize
          return effectiveFree < (config.minFreeSpaceGb as number) * 1024 ** 3
        })
        if (lowDisk !== undefined) {
          console.log(`[Download:4b:DISK] ✗ BLOCKED — ${lowDisk.path}: ${lowDisk.freeFormatted} free`)
          throw createError({
            statusCode: 507,
            statusMessage: `Insufficient disk space${session.user.role === 'admin' ? ` on ${lowDisk.path}` : ''} (${lowDisk.freeFormatted} free, minimum ${config.minFreeSpaceGb} GB required)`
          })
        }
      }
    }

    // ── 5: TRACKER (Polish) ───────────────────────────────────
    const qui = useQui()
    const dlTag = `dl-${randomUUID().slice(0, 8)}`
    let torrent
    let storedMagnetLink: string

    if (hasGuid && isPolishTracker) {
      console.log(`[Download:5:TRACKER] entering Polish tracker path...`)

      const trackerConfig = getTrackerCookieConfig(indexer, config)

      if (trackerConfig === null) {
        console.error(`[Download:5:TRACKER] ✗ unknown tracker: ${indexer}`)
        throw createError({ statusCode: 400, statusMessage: `Unknown tracker: ${indexer}` })
      }

      if (!trackerConfig.enabled) {
        console.error(`[Download:5:TRACKER] ✗ tracker disabled: ${indexer}`)
        throw createError({
          statusCode: 400,
          statusMessage: `Tracker ${indexer} is disabled. Set NUXT_TRACKER_${indexer === 'Devil-Torrents' ? 'DEVIL' : 'POLSKIE'}_ENABLED=true`
        })
      }

      if (trackerConfig.cookie.length === 0) {
        console.error(`[Download:5:TRACKER] ✗ no cookie for: ${indexer}`)
        throw createError({
          statusCode: 400,
          statusMessage: `No cookie configured for ${indexer}. Set NUXT_TRACKER_${indexer === 'Devil-Torrents' ? 'DEVIL' : 'POLSKIE'}_COOKIE`
        })
      }

      console.log(
        `[Download:5:TRACKER] config OK: enabled=${trackerConfig.enabled}, cookieLength=${trackerConfig.cookie.length}`
      )

      // ── 6: FETCH via got-scraping (Chrome TLS impersonation) ─
      console.log(`[Download:6:FETCH] url=${guidUrl} (got-scraping, impersonate=chrome)`)
      const t2 = Date.now()
      let fileBuffer: Buffer
      try {
        const response = await gotScraping({
          url: guidUrl,
          headers: { Cookie: trackerConfig.cookie },
          timeout: { request: 30_000 },
          responseType: 'buffer'
        })
        fileBuffer = response.body
        console.log(
          `[Download:6:FETCH] ← HTTP ${response.statusCode} in ${Date.now() - t2}ms, size=${fileBuffer.length}, contentType=${response.headers['content-type'] ?? 'N/A'}`
        )
        if (response.statusCode !== 200) {
          const preview = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 300))
          console.error(`[Download:6:FETCH] ✗ HTTP ${response.statusCode}: ${preview}`)
          throw createError({ statusCode: 502, statusMessage: `${indexer} returned ${response.statusCode}` })
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) throw err
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Download:6:FETCH] ✗ failed in ${Date.now() - t2}ms: ${msg}`)
        throw createError({ statusCode: 502, statusMessage: `Failed to connect to ${indexer}: ${msg}` })
      }

      // ── 7: VALIDATE response ────────────────────────────────
      const firstBytes = fileBuffer.subarray(0, 20).toString('hex')
      console.log(`[Download:7:VALIDATE] size=${fileBuffer.length}, firstBytes=${firstBytes}`)

      if (fileBuffer.length === 0) {
        console.error(`[Download:7:VALIDATE] ✗ empty response — cookie may be invalid`)
        throw createError({ statusCode: 401, statusMessage: `Empty response from ${indexer}. Cookie may be invalid.` })
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fileBuffer.length > 0 checked above
      const firstByte = fileBuffer[0]!
      if (firstByte === 0x3c) {
        const preview = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 500))
        console.error(`[Download:7:VALIDATE] ✗ got HTML (0x3c) instead of torrent!`)
        console.error(`[Download:7:VALIDATE]   preview: ${preview}`)
        throw createError({
          statusCode: 401,
          statusMessage: `Invalid or expired cookie for ${indexer}. Update NUXT_TRACKER_*_COOKIE`
        })
      }

      if (firstByte !== 0x64) {
        const preview = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 200))
        console.error(
          `[Download:7:VALIDATE] ✗ unexpected first byte: 0x${firstByte.toString(16)} (expected 0x64 = 'd' for bencode)`
        )
        console.error(`[Download:7:VALIDATE]   preview: ${preview}`)
        throw createError({
          statusCode: 401,
          statusMessage: `Invalid response from ${indexer} (not a valid torrent file, first byte: 0x${firstByte.toString(16)})`
        })
      }

      console.log(`[Download:7:VALIDATE] ✓ valid torrent file (${fileBuffer.length} bytes)`)

      // ── 8: QUI addTorrentFile ───────────────────────────────
      const fileName = `${label.replace(/[^a-zA-Z0-9._-]/g, '_')}.torrent`
      storedMagnetLink = `guid:${guidUrl}`

      console.log(
        `[Download:8:QUI] addTorrentFile: fileName=${fileName}, target=${targetPath}, cat=${savePath}, tag=${dlTag}`
      )
      const t3 = Date.now()
      try {
        torrent = await qui.addTorrentFile(fileBuffer, fileName, targetPath, savePath, dlTag)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Download:8:QUI] ✗ addTorrentFile failed in ${Date.now() - t3}ms: ${msg}`)
        throw createError({ statusCode: 502, statusMessage: `qBittorrent error: ${msg}` })
      }

      if (torrent !== null) {
        console.log(
          `[Download:8:QUI] ✓ added in ${Date.now() - t3}ms: hash=${torrent.hash} name="${torrent.name}" size=${torrent.size}`
        )
      } else {
        console.log(`[Download:8:QUI] ⚠ addTorrentFile returned null after ${Date.now() - t3}ms`)
      }
    } else {
      // ── 8b: QUI addTorrent (magnet/downloadUrl) ─────────────
      storedMagnetLink = hasDownloadUrl ? `download:${downloadUrl}` : torrentUrl
      console.log(`[Download:8:QUI] addTorrent (magnet/url): url=${torrentUrl.substring(0, 100)}, tag=${dlTag}`)
      const t3 = Date.now()
      try {
        torrent = await qui.addTorrent(torrentUrl, targetPath, savePath, dlTag)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Download:8:QUI] ✗ addTorrent failed in ${Date.now() - t3}ms: ${msg}`)
        throw createError({ statusCode: 502, statusMessage: `qBittorrent error: ${msg}` })
      }

      if (torrent !== null) {
        console.log(
          `[Download:8:QUI] ✓ added in ${Date.now() - t3}ms: hash=${torrent.hash} name="${torrent.name}" size=${torrent.size}`
        )
      } else {
        console.log(`[Download:8:QUI] ⚠ addTorrent returned null after ${Date.now() - t3}ms`)
      }
    }

    // ── 9: SIZE CHECK ────────────────────────────────────────
    if (torrent !== null) {
      const maxSizeBytes = session.user.maxTorrentSizeGb * 1024 * 1024 * 1024
      console.log(
        `[Download:9:SIZE] torrent.size=${torrent.size} (${(torrent.size / (1024 * 1024 * 1024)).toFixed(2)} GB) limit=${maxSizeBytes} (${session.user.maxTorrentSizeGb} GB)`
      )
      if (torrent.size > maxSizeBytes) {
        await qui.deleteTorrent(torrent.hash, true).catch(() => {})
        throw createError({
          statusCode: 413,
          statusMessage: `Torrent too large (${(torrent.size / (1024 * 1024 * 1024)).toFixed(1)} GB). Limit: ${session.user.maxTorrentSizeGb} GB`
        })
      }
    }

    // ── 9b: DISK CHECK POST-ADD ──────────────────────────────
    if (torrent !== null && torrent.size > 0 && config.diskSpaceCheckEnabled === true) {
      const disks = (config.disks as string).split(',').filter((d) => d.trim().length > 0)
      if (disks.length > 0) {
        const allStatuses = checkAllDisks(disks, config.minFreeSpaceGb as number)
        const lowDisk = allStatuses.find((d) => {
          if (!d.available) return false
          return torrent.size > d.freeBytes
        })
        if (lowDisk !== undefined) {
          console.log(
            `[Download:9b:DISK] ✗ POST-ADD DELETE — ${lowDisk.path}: ${lowDisk.freeFormatted} free, torrent=${formatSize(torrent.size)}`
          )
          await qui.deleteTorrent(torrent.hash, true).catch(() => {})
          const id = randomUUID()
          db.insert(downloads)
            .values({
              id,
              userId: session.user.id,
              label,
              torrentName: torrent.name,
              magnetLink: storedMagnetLink,
              savePath: savePath as SavePathKey,
              status: 'disk_full',
              torrentHash: torrent.hash,
              sizeBytes: torrent.size,
              posterUrl: null,
              tmdbId,
              mediaType: mediaType as 'movie' | 'tv' | null,
              createdAt: new Date().toISOString()
            })
            .run()
          throw createError({
            statusCode: 507,
            statusMessage: `Torrent too large for disk (${formatSize(torrent.size)}). Free: ${lowDisk.freeFormatted}${session.user.role === 'admin' ? ` on ${lowDisk.path}` : ''}`
          })
        }
      }
    }

    // ── 10: DB ────────────────────────────────────────────────
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
    console.log(`[Download:10:DB] inserting: id=${id} status=downloading hash=${torrent?.hash ?? 'null'}`)
    db.insert(downloads)
      .values({
        id,
        userId: session.user.id,
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
      userId: session.user.id,
      username: session.user.username,
      details: JSON.stringify({
        name: torrent?.name ?? 'unknown',
        label: label ?? '',
        savePath,
        sizeBytes: torrent?.size ?? 0
      })
    })

    // ── 11: DONE ──────────────────────────────────────────────
    console.log(`[Download:11:DONE] ✓ success in ${Date.now() - t0}ms: id=${id} hash=${torrent?.hash ?? 'null'}`)
    return { success: true, id, torrent }
  } catch (err) {
    console.error(`[Download:FATAL] ✗ handler failed in ${Date.now() - t0}ms:`, err)
    throw err
  }
})
