import { getTopRatedMovies, getImageUrl } from '#server/utils/tmdb'
import { markInLibrary } from '#server/utils/browse-utils'
import { getActiveSyncProviders } from '#server/utils/sync'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const providers = await getActiveSyncProviders()
  const libraryProvider = providers.find((p) => typeof p.isItemInLibrary === 'function')

  const query = getQuery(event)
  const locale = typeof query.locale === 'string' ? query.locale : 'en'

  type BrowseItem = {
    id: number
    type: 'movie'
    title: string
    overview: string
    posterUrl: string | null
    backdropUrl: string | null
    year: string
    rating: number
  }

  try {
    const data = await getTopRatedMovies(locale)

    const movies: BrowseItem[] = data.results.slice(0, 20).map((m) => ({
      id: m.id,
      type: 'movie' as const,
      title: m.title,
      overview: m.overview,
      posterUrl: getImageUrl(m.poster_path),
      backdropUrl: getImageUrl(m.backdrop_path, 'w780'),
      year: m.release_date?.slice(0, 4) ?? '',
      rating: m.vote_average
    }))

    const marked = await markInLibrary(movies, libraryProvider)

    return { movies: marked }
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: `TMDB API error: ${err instanceof Error ? err.message : 'unknown'}`
    })
  }
})
