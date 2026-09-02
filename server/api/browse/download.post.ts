import { downloads, customTrackers } from '#server/database/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { useDbAsync, dbGet, dbAll, dbRun } from '#server/utils/db'
import { getTrackerCookieConfig, getTrackerType, isPrivateTracker } from '#server/utils/prowlarr'
import type { TrackerCookieConfig } from '#server/types/prowlarr'
import { getFreshUser } from '#server/utils/user'
import { clearSessionCache, performTrackerLogin } from '#server/utils/tracker-auth'
import { decryptAES } from '#server/utils/crypto'
import { gotScraping } from 'got-scraping'
import { getMovieDetails, getTvShowDetails, getImageUrl } from '#server/utils/tmdb'
import { checkAllDisks, isDiskCheckEnabled, getDiskMinFreeGb } from '#server/utils/disk'
import { withTorrentAddLock, checkCooldown, setCooldown } from '#server/utils/mutex'
import { checkForDangerousFiles } from '#server/utils/torrents/safe-download'
import { normalizeEta } from '#server/utils/torrents/eta'
import { extractMagnetHash } from '#server/utils/clients/qbittorrent'
import { computeTorrentInfoHash } from '#server/utils/torrents/info-hash'
import { createLogger } from '#server/utils/logger'
import { assertExternalUrl } from '#server/utils/url-validate'
import type { DownloadBody } from '#server/types/browse'
import { DEDUP_MATCH_STATUSES, SAVE_PATH_KEYS, type SavePathKey } from '#server/types/torrent'

const log = createLogger('Download')

export default defineEventHandler(async (event) => {
  const t0 = Date.now()

  try {
    // ── 1: START ──────────────────────────────────────────────
    const session = await getUserSession(event)
    if (!session.user) {
      throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
    }

    const freshUser = await getFreshUser(session.user.id)
    if (freshUser === undefined) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    const cooldown = checkCooldown(session.user.id)
    if (!cooldown.ok) {
      throw createError({
        statusCode: 429,
        statusMessage: `Please wait ${Math.ceil(cooldown.remainingMs / 1000)}s before adding another torrent`
      })
    }

    const body = await readBody<DownloadBody>(event)
    const rawMagnetLink = body.magnetLink ?? ''
    const downloadUrl = body.downloadUrl ?? ''
    const guidUrl = body.guid ?? ''
    const indexer = body.indexer ?? ''
    const resolution = body.resolution ?? null
    const savePath = body.savePath
    const label = body.label
    const tmdbId = body.tmdbId ?? null
    const rawMediaType = body.mediaType
    const mediaType = rawMediaType === 'movie' || rawMediaType === 'tv' ? rawMediaType : null

    const hasMagnet = rawMagnetLink.length > 0
    const hasDownloadUrl = downloadUrl.length > 0
    const hasGuid = guidUrl.length > 0
    const isPrivateTrackerEnabled = await isPrivateTracker(indexer)

    log.info(
      `[Download:1:START] user=${session.user.username} role=${session.user.role} indexer="${indexer}" isPrivate=${isPrivateTrackerEnabled} hasGuid=${hasGuid} hasMagnet=${hasMagnet} hasDownloadUrl=${hasDownloadUrl} label="${label}" savePath=${savePath}`
    )
    if (hasGuid) log.info(`[Download:1:START]   guid=${guidUrl}`)
    if (hasDownloadUrl) log.info(`[Download:1:START]   downloadUrl=${downloadUrl.substring(0, 120)}`)
    if (hasMagnet) log.info(`[Download:1:START]   magnet=${rawMagnetLink.substring(0, 80)}`)

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
      log.error(`[Download:2:VALIDATE] ✗ invalid torrentUrl prefix: ${torrentUrl.substring(0, 40)}`)
      throw createError({ statusCode: 400, statusMessage: 'Invalid magnet link or torrent URL' })
    }

    if (!savePath || !SAVE_PATH_KEYS.includes(savePath as SavePathKey)) {
      log.error(`[Download:2:VALIDATE] ✗ invalid savePath: ${savePath}`)
      throw createError({
        statusCode: 400,
        statusMessage: 'Valid save path is required (movies, series, games, music, books)'
      })
    }

    log.info(`[Download:2:VALIDATE] ✓ torrentUrl=${torrentUrl.substring(0, 100)}`)

    // ── 4: SAVE PATH ──────────────────────────────────────────
    const config = useRuntimeConfig()
    const prowlarrUrl = ((config.prowlarrUrl as string) || '').replace(/\/+$/, '')

    if (torrentUrl.startsWith('http://') || torrentUrl.startsWith('https://')) {
      if (!prowlarrUrl || !torrentUrl.startsWith(prowlarrUrl)) {
        assertExternalUrl(torrentUrl)
      }
    }

    if (guidUrl && (guidUrl.startsWith('http://') || guidUrl.startsWith('https://'))) {
      if (!prowlarrUrl || !guidUrl.startsWith(prowlarrUrl)) {
        assertExternalUrl(guidUrl)
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
      log.error(`[Download:4:PATH] ✗ no path for savePath=${savePath}`)
      throw createError({ statusCode: 500, statusMessage: 'Save path not configured' })
    }
    log.info(`[Download:4:PATH] savePath=${savePath} → ${targetPath}`)

    const userId = session.user.id
    const userRole = session.user.role
    const username = session.user.username

    return await withTorrentAddLock(async () => {
      // ── 3: LIMITS (inside lock) ───────────────────────────────
      const db = await useDbAsync()

      if (userRole !== 'admin') {
        const userDownloads = await dbAll(
          db
            .select()
            .from(downloads)
            .where(and(eq(downloads.userId, userId), eq(downloads.status, 'downloading')))
        )

        log.info(`[Download:3:LIMITS] active=${userDownloads.length}/${freshUser.activeTorrentLimit}`)

        if (userDownloads.length >= freshUser.activeTorrentLimit) {
          throw createError({
            statusCode: 429,
            statusMessage: `Active torrent limit reached (${freshUser.activeTorrentLimit})`
          })
        }

        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)

        const todayAll = (await dbAll(db.select().from(downloads).where(eq(downloads.userId, userId)))).filter(
          (d) => new Date(d.createdAt) >= todayStart
        )

        const todayActive = todayAll.filter((d) => d.status !== 'failed' && d.status !== 'removed')

        log.info(`[Download:3:LIMITS] today=${todayActive.length}/${freshUser.dailyDownloadLimit}`)

        if (todayActive.length >= freshUser.dailyDownloadLimit) {
          throw createError({
            statusCode: 429,
            statusMessage: `Daily download limit reached (${freshUser.dailyDownloadLimit})`
          })
        }

        if (isPrivateTrackerEnabled) {
          const todayPrivate = todayAll.filter((d) => d.isPrivate)
          log.info(`[Download:3:LIMITS] todayPrivate=${todayPrivate.length}/${freshUser.privateTrackerLimit}`)
          if (todayPrivate.length >= freshUser.privateTrackerLimit) {
            throw createError({
              statusCode: 429,
              statusMessage: `Private tracker daily limit reached (${freshUser.privateTrackerLimit})`
            })
          }
        }
      } else {
        log.info(`[Download:3:LIMITS] admin - skipping all limits`)
      }

      // ── 3b: DUPLICATE CHECK (magnet hash known up front) ──────
      let infoHash: string | null = null

      const magnetHash = hasMagnet ? extractMagnetHash(rawMagnetLink) : null
      if (magnetHash !== null) {
        const existingActive = await dbGet(
          db
            .select()
            .from(downloads)
            .where(
              and(
                eq(downloads.userId, userId),
                eq(downloads.torrentHash, magnetHash),
                inArray(downloads.status, DEDUP_MATCH_STATUSES)
              )
            )
        )
        if (existingActive !== undefined) {
          log.info(
            `[Download:3b:DUP] already active: hash=${magnetHash} id=${existingActive.id} label="${existingActive.label}"`
          )
          return { already: true, id: existingActive.id }
        }
      }

      // ── 3c: DUPLICATE CHECK (same stored link, e.g. same Prowlarr URL) ──
      const willStoreLink = hasDownloadUrl ? `download:${downloadUrl}` : torrentUrl
      const existingByLink = await dbGet(
        db
          .select()
          .from(downloads)
          .where(
            and(
              eq(downloads.userId, userId),
              eq(downloads.magnetLink, willStoreLink),
              inArray(downloads.status, DEDUP_MATCH_STATUSES)
            )
          )
      )
      if (existingByLink !== undefined) {
        log.info(
          `[Download:3c:DUP] already active by link: link=${willStoreLink.substring(0, 80)} id=${existingByLink.id} label="${existingByLink.label}"`
        )
        return { already: true, id: existingByLink.id }
      }

      // ── 5: TRACKER (Polish) ───────────────────────────────────
      const qbit = useQBittorrent()
      const dlTag = `dl-${randomUUID().slice(0, 8)}`
      let torrent
      let storedMagnetLink: string

      if (hasGuid && isPrivateTrackerEnabled && (await getTrackerType(indexer)) === 'guid') {
        log.info(`[Download:5:TRACKER] entering private tracker path...`)

        const trackerFixHint =
          userRole === 'admin'
            ? 'Update the cookie in admin panel → Trackers.'
            : 'Please contact the site administrator.'

        let trackerConfig: TrackerCookieConfig | null
        try {
          trackerConfig = await getTrackerCookieConfig(indexer, config)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log.error(`[Download:5:TRACKER] ✗ auto-login failed for ${indexer}: ${msg}`)
          throw createError({
            statusCode: 502,
            statusMessage: `Failed to authenticate with ${indexer} - auto-login failed. ${trackerFixHint}`
          })
        }

        if (trackerConfig === null) {
          log.error(`[Download:5:TRACKER] ✗ unknown tracker: ${indexer}`)
          throw createError({ statusCode: 400, statusMessage: `Unknown tracker: ${indexer}` })
        }

        if (!trackerConfig.enabled) {
          log.error(`[Download:5:TRACKER] ✗ tracker disabled: ${indexer}`)
          throw createError({
            statusCode: 400,
            statusMessage: `Tracker ${indexer} is disabled. Enable it in admin panel → Trackers.`
          })
        }

        if (trackerConfig.cookie.length === 0) {
          log.error(`[Download:5:TRACKER] ✗ no cookie for: ${indexer}`)
          throw createError({
            statusCode: 400,
            statusMessage: `No cookie configured for ${indexer}. Add cookie in admin panel → Trackers.`
          })
        }

        log.info(
          `[Download:5:TRACKER] config OK: enabled=${trackerConfig.enabled}, cookieLength=${trackerConfig.cookie.length}`
        )

        // Store tracker row for retry in step 7
        const trackerRow = await dbGet(db.select().from(customTrackers).where(eq(customTrackers.indexerName, indexer)))

        // ── 6: FETCH via got-scraping (Chrome TLS impersonation) ─
        const cookiePreview = trackerConfig.cookie.substring(0, 20) + '...'
        let referer: string
        try {
          const url = new URL(guidUrl)
          referer = url.origin + url.pathname
        } catch {
          referer = guidUrl
        }
        log.info(`[Download:6:FETCH] url=${guidUrl} (got-scraping, impersonate=chrome)`)
        log.info(`[Download:6:FETCH] cookie="${cookiePreview}" referer="${referer}"`)
        const t2 = Date.now()
        let fileBuffer: Buffer
        let responseContentType: string
        try {
          const response = await gotScraping({
            url: guidUrl,
            headers: {
              Cookie: trackerConfig.cookie,
              Referer: referer
            },
            timeout: { request: 30_000 },
            responseType: 'buffer'
          })
          fileBuffer = response.body
          responseContentType = (response.headers['content-type'] as string | undefined) ?? ''
          const respHeaders = Object.fromEntries(
            Object.entries(response.headers).filter(([k]) =>
              ['content-type', 'set-cookie', 'location', 'cf-ray', 'server'].includes(k)
            )
          )
          log.info(
            `[Download:6:FETCH] ← HTTP ${response.statusCode} in ${Date.now() - t2}ms, size=${fileBuffer.length}, contentType=${response.headers['content-type'] ?? 'N/A'}`
          )
          log.info(`[Download:6:FETCH]   response headers: ${JSON.stringify(respHeaders)}`)
          if (response.statusCode !== 200) {
            const preview = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 300))
            log.error(`[Download:6:FETCH] ✗ HTTP ${response.statusCode}: ${preview}`)
            throw createError({ statusCode: 502, statusMessage: `${indexer} returned ${response.statusCode}` })
          }
        } catch (err) {
          if (err instanceof Error && 'statusCode' in err) throw err
          const msg = err instanceof Error ? err.message : String(err)
          log.error(`[Download:6:FETCH] ✗ failed in ${Date.now() - t2}ms: ${msg}`)
          throw createError({ statusCode: 502, statusMessage: `Failed to connect to ${indexer}: ${msg}` })
        }

        // ── 7: VALIDATE response ────────────────────────────────
        const firstBytes = fileBuffer.subarray(0, 20).toString('hex')
        log.info(`[Download:7:VALIDATE] size=${fileBuffer.length}, firstBytes=${firstBytes}`)

        if (fileBuffer.length === 0) {
          log.error(`[Download:7:VALIDATE] ✗ empty response - cookie may be invalid`)
          throw createError({
            statusCode: 502,
            statusMessage: `Failed to authenticate with ${indexer} - empty response, cookie may be invalid. ${trackerFixHint}`
          })
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fileBuffer.length > 0 checked above
        const firstByte = fileBuffer[0]!
        const bodyPreview = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 200))
        const isHtml =
          responseContentType.includes('text/html') ||
          bodyPreview.includes('<!DOCTYPE') ||
          bodyPreview.includes('<html')

        if (isHtml) {
          const preview = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 500))
          log.error(`[Download:7:VALIDATE] ✗ got HTML instead of torrent! contentType=${responseContentType}`)
          log.error(`[Download:7:VALIDATE]   preview: ${preview}`)

          // Retry: if tracker has login credentials, clear cache + re-login + retry once
          if (
            trackerRow !== undefined &&
            trackerRow.loginUrl !== null &&
            trackerRow.loginUrl.length > 0 &&
            trackerRow.loginUsername !== null &&
            trackerRow.loginUsername.length > 0 &&
            trackerRow.loginPassword !== null &&
            trackerRow.loginPassword.length > 0
          ) {
            log.info(`[Download:7:VALIDATE] Session may be expired - retrying login for ${indexer}...`)

            clearSessionCache(trackerRow.loginUrl, trackerRow.loginUsername)

            const decryptedPassword = decryptAES(trackerRow.loginPassword)
            const freshCookie = await performTrackerLogin(
              trackerRow.loginUrl,
              trackerRow.loginUsername,
              decryptedPassword
            )

            log.info(`[Download:7:VALIDATE] Retry fetch with fresh cookie (${freshCookie.length} chars)...`)
            const t2Retry = Date.now()
            try {
              const retryResponse = await gotScraping({
                url: guidUrl,
                headers: {
                  Cookie: freshCookie,
                  Referer: referer
                },
                timeout: { request: 30_000 },
                responseType: 'buffer'
              })
              fileBuffer = retryResponse.body
              const retryContentType = (retryResponse.headers['content-type'] as string | undefined) ?? ''
              const retryBodyPreview = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 200))
              const retryIsHtml =
                retryContentType.includes('text/html') ||
                retryBodyPreview.includes('<!DOCTYPE') ||
                retryBodyPreview.includes('<html')
              log.info(
                `[Download:7:VALIDATE] Retry ← HTTP ${retryResponse.statusCode} in ${Date.now() - t2Retry}ms, size=${fileBuffer.length}, isHtml=${retryIsHtml}`
              )
              if (retryResponse.statusCode !== 200) {
                const retryPreview = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 300))
                log.error(`[Download:7:VALIDATE] ✗ Retry HTTP ${retryResponse.statusCode}: ${retryPreview}`)
                throw createError({
                  statusCode: 502,
                  statusMessage: `${indexer} returned ${retryResponse.statusCode} after retry`
                })
              }
              if (retryIsHtml) {
                const retryHtmlPreview = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 300))
                log.error(`[Download:7:VALIDATE] ✗ Retry also returned HTML - cookie truly invalid`)
                log.error(`[Download:7:VALIDATE]   retry preview: ${retryHtmlPreview}`)
                throw createError({
                  statusCode: 502,
                  statusMessage: `Failed to authenticate with ${indexer} - cookie expired and re-login failed. ${trackerFixHint}`
                })
              }
            } catch (err) {
              if (err instanceof Error && 'statusCode' in err) throw err
              const msg = err instanceof Error ? err.message : String(err)
              log.error(`[Download:7:VALIDATE] ✗ Retry failed in ${Date.now() - t2Retry}ms: ${msg}`)
              throw createError({ statusCode: 502, statusMessage: `Retry to ${indexer} failed: ${msg}` })
            }
          } else {
            // No login credentials - cannot retry
            const hostname = (() => {
              try {
                return new URL(guidUrl).hostname
              } catch {
                return guidUrl
              }
            })()
            throw createError({
              statusCode: 502,
              statusMessage: `Failed to authenticate with ${indexer} - server returned a login page for ${hostname}. ${trackerFixHint}`
            })
          }
        }

        if (firstByte !== 0x64) {
          const preview = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 200))
          log.error(
            `[Download:7:VALIDATE] ✗ unexpected first byte: 0x${firstByte.toString(16)} (expected 0x64 = 'd' for bencode)`
          )
          log.error(`[Download:7:VALIDATE]   preview: ${preview}`)
          throw createError({
            statusCode: 502,
            statusMessage: `Failed to authenticate with ${indexer} - response is not a valid torrent file. ${trackerFixHint}`
          })
        }

        log.info(`[Download:7:VALIDATE] ✓ valid torrent file (${fileBuffer.length} bytes)`)

        // ── 7b: INFO HASH (duplicate pre-check + 409 handling) ──
        try {
          infoHash = computeTorrentInfoHash(fileBuffer)
        } catch (err) {
          log.warn(
            `[Download:7b:HASH] ✗ info-hash computation failed: ${err instanceof Error ? err.message : String(err)}`
          )
        }
        if (infoHash !== null) {
          log.info(`[Download:7b:HASH] ✓ infoHash=${infoHash}`)
          const existingActive = await dbGet(
            db
              .select()
              .from(downloads)
              .where(
                and(
                  eq(downloads.userId, userId),
                  eq(downloads.torrentHash, infoHash),
                  inArray(downloads.status, DEDUP_MATCH_STATUSES)
                )
              )
          )
          if (existingActive !== undefined) {
            log.info(
              `[Download:7b:DUP] already active: hash=${infoHash} id=${existingActive.id} label="${existingActive.label}"`
            )
            return { already: true, id: existingActive.id }
          }
        }

        // ── 8: QBIT addTorrentFile ───────────────────────────────
        const fileName = `${label.replace(/[^a-zA-Z0-9._-]/g, '_')}.torrent`
        storedMagnetLink = `guid:${guidUrl}`

        setCooldown(userId)
        log.info(
          `[Download:8:QBIT] addTorrentFile: fileName=${fileName}, target=${targetPath}, cat=${savePath}, tag=${dlTag}`
        )
        const t3 = Date.now()
        try {
          torrent = await qbit.addTorrentFile(fileBuffer, fileName, targetPath, savePath, dlTag, infoHash)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log.error(`[Download:8:QBIT] ✗ addTorrentFile failed in ${Date.now() - t3}ms: ${msg}`)
          throw createError({ statusCode: 502, statusMessage: `qBittorrent error: ${msg}` })
        }

        if (torrent !== null) {
          log.info(
            `[Download:8:QBIT] ✓ added in ${Date.now() - t3}ms: hash=${torrent.hash} name="${torrent.name}" size=${torrent.size}`
          )
        } else {
          log.warn(`[Download:8:QBIT] ⚠ addTorrentFile returned null after ${Date.now() - t3}ms`)
        }
      } else {
        // ── 8b: QBIT addTorrent (magnet/downloadUrl) ─────────────
        storedMagnetLink = hasDownloadUrl ? `download:${downloadUrl}` : torrentUrl
        setCooldown(userId)
        log.info(`[Download:8:QBIT] addTorrent (magnet/url): url=${torrentUrl.substring(0, 100)}, tag=${dlTag}`)
        const t3 = Date.now()
        try {
          torrent = await qbit.addTorrent(torrentUrl, targetPath, savePath, dlTag, magnetHash)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log.error(`[Download:8:QBIT] ✗ addTorrent failed in ${Date.now() - t3}ms: ${msg}`)
          throw createError({ statusCode: 502, statusMessage: `qBittorrent error: ${msg}` })
        }

        if (torrent !== null) {
          log.info(
            `[Download:8:QBIT] ✓ added in ${Date.now() - t3}ms: hash=${torrent.hash} name="${torrent.name}" size=${torrent.size}`
          )
        } else {
          log.warn(`[Download:8:QBIT] ⚠ addTorrent returned null after ${Date.now() - t3}ms`)
        }
      }

      // ── 8c: DANGEROUS FILE CHECK ─────────────────────────────
      if (torrent !== null) {
        const t4 = Date.now()
        let files = await qbit.getTorrentFiles(torrent.hash).catch(() => [])

        // Wait for metadata if file list is empty
        if (files.length === 0) {
          for (let i = 0; i < 5; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
            files = await qbit.getTorrentFiles(torrent.hash).catch(() => [])
            if (files.length > 0) break
          }
        }

        log.info(`[Download:8c:FILE_CHECK] hash=${torrent.hash} files=${files.length} (in ${Date.now() - t4}ms)`)

        if (files.length > 0) {
          const { safe, dangerousFiles } = checkForDangerousFiles(files)
          if (!safe) {
            log.warn(`[Download:8c:FILE_CHECK] ✗ BLOCKED - dangerous files: ${dangerousFiles.join(', ')}`)
            await qbit.deleteTorrent(torrent.hash, true).catch(() => {})
            throw createError({
              statusCode: 403,
              statusMessage: `Torrent contains dangerous files: ${dangerousFiles.map((f) => f.split('/').pop() ?? f).join(', ')} - rejected`
            })
          }
          log.info(`[Download:8c:FILE_CHECK] ✓ all ${files.length} files safe`)
        } else {
          log.warn(`[Download:8c:FILE_CHECK] ⚠ no files found (metadata not ready?), skipping check`)
        }
      }

      // ── 9: SIZE CHECK ────────────────────────────────────────
      if (torrent !== null) {
        const maxSizeBytes = freshUser.maxTorrentSizeGb * 1024 * 1024 * 1024
        log.info(
          `[Download:9:SIZE] torrent.size=${torrent.size} (${(torrent.size / (1024 * 1024 * 1024)).toFixed(2)} GB) limit=${maxSizeBytes} (${freshUser.maxTorrentSizeGb} GB)`
        )
        if (torrent.size > maxSizeBytes) {
          await qbit.deleteTorrent(torrent.hash, true).catch(() => {})
          throw createError({
            statusCode: 413,
            statusMessage: `Torrent too large (${(torrent.size / (1024 * 1024 * 1024)).toFixed(1)} GB). Limit: ${freshUser.maxTorrentSizeGb} GB`
          })
        }
      }

      // ── 9b: DISK CHECK POST-ADD ──────────────────────────────
      if (torrent !== null && torrent.size > 0 && (await isDiskCheckEnabled())) {
        const disks = (config.disks as string).split(',').filter((d) => d.trim().length > 0)
        if (disks.length > 0) {
          const allStatuses = await checkAllDisks(disks, await getDiskMinFreeGb())
          const lowDisk = allStatuses.find((d) => {
            if (!d.available) return true
            return torrent.size > d.freeBytes
          })
          if (lowDisk !== undefined) {
            log.warn(
              `[Download:9b:DISK] ✗ POST-ADD DELETE - ${lowDisk.path}: ${lowDisk.available ? lowDisk.freeFormatted + ' free' : 'unavailable'}, torrent=${formatSize(torrent.size)}`
            )
            await qbit.deleteTorrent(torrent.hash, true).catch(() => {})
            const id = randomUUID()
            await dbRun(
              db.insert(downloads).values({
                id,
                userId,
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
                createdAt: new Date().toISOString(),
                indexerName: indexer === '' ? null : indexer,
                resolution,
                qbitTag: dlTag
              })
            )
            throw createError({
              statusCode: 507,
              statusMessage: `Torrent too large for disk (${formatSize(torrent.size)}). Free: ${lowDisk.freeFormatted}${userRole === 'admin' ? ` on ${lowDisk.path}` : ''}`
            })
          }
        }
      }

      // ── 9c: ADMIN QUEUE PRIORITY ──────────────────────────────
      if (torrent !== null && userRole === 'admin') {
        await qbit.moveToTop([torrent.hash]).catch(() => {})
      }

      // ── 9d: POST-ADD DUPLICATE GUARD ───────────────────────────
      // Catches the case where qBittorrent returned an existing torrent (409)
      // and an active row for this user already exists for its hash.
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
          log.info(`[Download:9d:DUP] already active after add: hash=${torrent.hash} id=${existingActive.id}`)
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
            log.info(
              `[Download:9d:DUP] already active after add (tag): tag="${torrent.tags}" id=${tagRow.id} label="${tagRow.label}"`
            )
            return { already: true, id: tagRow.id }
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
          // ignore - poster is optional
        }
      }

      const id = randomUUID()
      const isPrivateDownload = (await getTrackerType(indexer)) !== null
      const storedHash = torrent?.hash ?? infoHash ?? extractMagnetHash(torrentUrl)
      log.info(
        `[Download:10:DB] inserting: id=${id} status=downloading hash=${storedHash ?? 'null'} isPrivate=${isPrivateDownload} indexer="${indexer}" resolution=${resolution ?? 'null'}`
      )
      await dbRun(
        db.insert(downloads).values({
          id,
          userId,
          label: label ?? '',
          torrentName: torrent?.name ?? '',
          magnetLink: storedMagnetLink,
          savePath: savePath as SavePathKey,
          status: 'downloading',
          torrentHash: storedHash,
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
          isPrivate: isPrivateDownload,
          indexerName: indexer === '' ? null : indexer,
          resolution,
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

      // ── 11: DONE ──────────────────────────────────────────────
      log.info(`[Download:11:DONE] ✓ success in ${Date.now() - t0}ms: id=${id} hash=${torrent?.hash ?? 'null'}`)
      return { success: true, id, torrent }
    })
  } catch (err) {
    log.error(err, `[Download:FATAL] ✗ handler failed in ${Date.now() - t0}ms:`)
    throw err
  }
})
