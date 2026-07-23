import { getEnabledCustomTrackerNames, POLISH_TRACKERS } from '#server/utils/prowlarr'
import { createLogger } from '#server/utils/logger'
import type { ProwlarrDebugRelease } from '#server/types/prowlarr'

const log = createLogger('Debug')

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user || session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin only' })
  }

  const query = getQuery(event).query as string | undefined
  if (query === undefined || query === null || query.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Missing ?query= parameter' })
  }

  const config = useRuntimeConfig()
  const prowlarrUrl = config.prowlarrUrl as string
  const prowlarrApiKey = config.prowlarrApiKey as string
  if (!prowlarrUrl || !prowlarrApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Prowlarr not configured' })
  }

  log.info(`[Debug] Query: "${query}"`)

  const url = `${prowlarrUrl}/api/v1/search?apikey=${prowlarrApiKey}&type=search&query=${encodeURIComponent(query)}`
  const response = await fetch(url)
  if (!response.ok) {
    throw createError({ statusCode: 502, statusMessage: `Prowlarr returned ${response.status}` })
  }

  const raw = (await response.json()) as ProwlarrDebugRelease[]
  const customNames = await getEnabledCustomTrackerNames()

  const results = raw.map((item) => {
    const hasMagnet = item.magnetUrl !== null && item.magnetUrl !== undefined
    const hasDownloadUrl = item.downloadUrl !== null && item.downloadUrl !== undefined
    const isPolish = POLISH_TRACKERS.includes(item.indexer)
    const isCustom = customNames.includes(item.indexer)
    const downloadable = hasMagnet || hasDownloadUrl || isPolish || isCustom
    const filterReason = !downloadable
      ? !hasMagnet && !hasDownloadUrl
        ? 'no magnetUrl and no downloadUrl'
        : 'not in POLISH_TRACKERS or customTrackers'
      : null

    return {
      title: item.title,
      indexer: item.indexer,
      seeders: item.seeders ?? 0,
      leechers: item.leechers ?? 0,
      size: item.size,
      categories: item.categories ?? [],
      magnetUrl: hasMagnet ? item.magnetUrl?.substring(0, 80) + '...' : null,
      downloadUrl: hasDownloadUrl ? item.downloadUrl : null,
      guid: item.guid ?? null,
      downloadable,
      filterReason
    }
  })

  const downloadableResults = results.filter((r) => r.downloadable)
  const filteredResults = results.filter((r) => !r.downloadable)

  const byIndexer: Record<string, { total: number; downloadable: number; titles: string[] }> = {}
  for (const r of results) {
    const entry = byIndexer[r.indexer] ?? { total: 0, downloadable: 0, titles: [] }
    entry.total++
    if (r.downloadable) entry.downloadable++
    if (entry.titles.length < 3) entry.titles.push(r.title)
    byIndexer[r.indexer] = entry
  }

  log.info(
    `[Debug] Results: ${raw.length} raw, ${downloadableResults.length} downloadable, ${filteredResults.length} filtered`
  )

  return {
    query,
    rawCount: raw.length,
    downloadableCount: downloadableResults.length,
    filteredCount: filteredResults.length,
    byIndexer,
    filteredReasons: filteredResults.slice(0, 10).map((r) => ({
      title: r.title,
      indexer: r.indexer,
      reason: r.filterReason
    })),
    topResults: downloadableResults.slice(0, 20).map((r) => ({
      title: r.title,
      indexer: r.indexer,
      seeders: r.seeders,
      size: r.size,
      hasMagnet: r.magnetUrl !== null,
      hasDownloadUrl: r.downloadUrl !== null,
      isPrivate: POLISH_TRACKERS.includes(r.indexer) || customNames.includes(r.indexer)
    }))
  }
})
