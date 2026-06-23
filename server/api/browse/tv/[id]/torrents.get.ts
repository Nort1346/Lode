import { getTvShowDetails } from '#server/utils/tmdb'
import { useProwlarr, PROWLARR_CATEGORIES } from '#server/utils/prowlarr'
import { rankTorrents } from '#server/utils/torrent-ranker'
import { checkDailyLimit } from '#server/utils/limits'
import { getRankingConfig } from '#server/utils/ranking-config'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const id = Number(getRouterParam(event, 'id'))
  if (isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid TV show ID' })
  }

  const locale = (getQuery(event).locale as string | undefined) ?? 'pl'

  const limit = checkDailyLimit(session.user.id)
  if (limit.reached) {
    throw createError({
      statusCode: 429,
      data: { activeCount: limit.activeCount, todayCount: limit.todayCount, limit: limit.limit }
    })
  }

  let show
  try {
    show = await getTvShowDetails(id, locale)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Failed to fetch TV show details from TMDB' })
  }

  let torrents: ReturnType<typeof rankTorrents> = []
  const prowlarr = useProwlarr()
  if (prowlarr !== null) {
    try {
      const rankingConfig = await getRankingConfig()
      const year = show.first_air_date?.slice(0, 4) ?? ''
      const imdbId = show.external_ids?.imdb_id ?? null
      let rawResults = await prowlarr.searchTv(show.name, show.original_name, year, imdbId, null, locale, [
        PROWLARR_CATEGORIES.TV
      ])
      if (rawResults.length === 0 && show.original_name !== show.name) {
        rawResults = await prowlarr.searchTv(show.original_name, show.name, year, imdbId, null, locale, [
          PROWLARR_CATEGORIES.TV
        ])
      }
      torrents = rankTorrents(rawResults, 'series', show.name, year, rankingConfig)
    } catch {
      // Prowlarr might be offline
    }
  }

  return {
    torrents: torrents.map((t) => ({
      title: t.title,
      size: t.size,
      sizeFormatted: formatSize(t.size),
      seeders: t.seeders,
      leechers: t.leechers,
      indexer: t.indexer,
      magnetLink: t.magnetLink,
      downloadUrl: t.downloadUrl,
      guid: t.guid,
      score: t.score,
      percentage: t.percentage,
      recommended: t.recommended,
      resolution: t.parsed.resolution,
      source: t.parsed.source,
      language: t.parsed.language,
      isPrivate: t.isPrivate
    }))
  }
})
