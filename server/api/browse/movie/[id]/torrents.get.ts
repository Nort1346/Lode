import { searchMovieTorrents } from '#server/utils/torrents/torrent-search'
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

  const locale = (getQuery(event).locale as string | undefined) ?? 'en'

  const limit = await checkDailyLimit(session.user.id)
  if (limit.reached) {
    throw createError({
      statusCode: 429,
      data: { activeCount: limit.activeCount, todayCount: limit.todayCount, limit: limit.limit }
    })
  }

  const outcome = await searchMovieTorrents(id, locale)
  if (outcome.kind === 'details-failed') {
    throw createError({ statusCode: 502, statusMessage: 'Failed to fetch movie details from TMDB' })
  }

  return outcome.payload
})
