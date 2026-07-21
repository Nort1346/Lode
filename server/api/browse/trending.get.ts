import { getTrending, getLogosForItems, getImageUrl } from '#server/utils/tmdb'
import { markInLibrary } from '#server/utils/browse-utils'
import { getActiveSyncProviders } from '#server/utils/sync'
import type { TrendingItem } from '#server/types/browse'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const providers = await getActiveSyncProviders()
  const libraryProvider = providers.find((p) => typeof p.isItemInLibrary === 'function')

  const query = getQuery(event)
  const locale = (query.locale as string) ?? 'en'

  try {
    const items = await getTrending(locale)
    const sliced = items.slice(0, 20)

    const logoMap = await getLogosForItems(
      sliced.map((item) => ({ id: item.id, media_type: item.media_type })),
      locale
    )

    const results: TrendingItem[] = sliced.map((item) => ({
      id: item.id,
      type: item.media_type,
      title: item.title ?? item.name ?? '',
      overview: item.overview,
      posterUrl: getImageUrl(item.poster_path),
      backdropUrl: getImageUrl(item.backdrop_path, 'original'),
      logoUrl: logoMap.get(item.id) ?? null,
      year: (item.release_date ?? item.first_air_date ?? '').slice(0, 4),
      rating: item.vote_average
    }))

    const marked = await markInLibrary(results, libraryProvider)

    return { items: marked }
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: `TMDB API error: ${err instanceof Error ? err.message : 'unknown'}`
    })
  }
})
