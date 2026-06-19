import { getMovieDetails } from '#server/utils/tmdb'
import { useProwlarr } from '#server/utils/prowlarr'
import { rankTorrents, formatSize } from '#server/utils/torrent-ranker'
import { checkDailyLimit } from '#server/utils/limits'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const id = Number(getRouterParam(event, 'id'))
  if (isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid movie ID' })
  }

  const locale = (getQuery(event).locale as string | undefined) ?? 'pl'

  const limit = checkDailyLimit(session.user.id)
  if (limit.reached) {
    throw createError({
      statusCode: 429,
      data: { activeCount: limit.activeCount, todayCount: limit.todayCount, limit: limit.limit }
    })
  }

  let movie
  try {
    movie = await getMovieDetails(id, locale)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Failed to fetch movie details from TMDB' })
  }

  let torrents: ReturnType<typeof rankTorrents> = []
  const prowlarr = useProwlarr()
  if (prowlarr !== null) {
    try {
      const year = movie.release_date?.slice(0, 4) ?? ''
      let rawResults = await prowlarr.searchByQuery(`${movie.title} ${year}`.trim(), locale)
      if (rawResults.length === 0 && movie.original_title !== movie.title) {
        rawResults = await prowlarr.searchByQuery(`${movie.original_title} ${year}`.trim(), locale)
      }
      torrents = rankTorrents(rawResults, 'movie', movie.title, year)
    } catch {
      // Prowlarr might be offline, return empty torrents
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
      recommended: t.recommended,
      resolution: t.parsed.resolution,
      source: t.parsed.source,
      language: t.parsed.language,
      isPrivate: t.isPrivate
    }))
  }
})
