import { searchSeasonTorrents } from '#server/utils/torrents/torrent-search'
import { checkDailyLimit } from '#server/utils/limits'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const showId = Number(getRouterParam(event, 'id'))
  const seasonNumber = Number(getRouterParam(event, 'season'))
  if (isNaN(showId) || isNaN(seasonNumber)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid show/season ID' })
  }

  const locale = (getQuery(event).locale as string | undefined) ?? 'en'

  const limit = await checkDailyLimit(session.user.id)
  if (limit.reached) {
    throw createError({
      statusCode: 429,
      data: { activeCount: limit.activeCount, todayCount: limit.todayCount, limit: limit.limit }
    })
  }

  const outcome = await searchSeasonTorrents(showId, seasonNumber, locale)
  if (outcome.kind === 'details-failed') {
    throw createError({ statusCode: 502, statusMessage: 'Failed to fetch season details from TMDB' })
  }

  return outcome.payload
})
