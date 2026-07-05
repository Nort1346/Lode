import { getMoviesByGenre, getTvByGenre, getImageUrl } from '#server/utils/tmdb'
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
  const genreId = Number(query.genreId)
  const mediaType = query.mediaType === 'tv' ? 'tv' : 'movie'

  if (Number.isNaN(genreId) || genreId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid genreId' })
  }

  type BrowseItem = {
    id: number
    type: 'movie' | 'tv'
    title: string
    overview: string
    posterUrl: string | null
    backdropUrl: string | null
    year: string
    rating: number
  }

  try {
    if (mediaType === 'movie') {
      const data = await getMoviesByGenre(genreId, locale)
      const movies: BrowseItem[] = data.results.slice(0, 20).map((m) => ({
        id: m.id,
        type: 'movie' as const,
        title: m.title,
        overview: m.overview,
        posterUrl: getImageUrl(m.poster_path),
        backdropUrl: getImageUrl(m.backdrop_path, 'original'),
        year: m.release_date?.slice(0, 4) ?? '',
        rating: m.vote_average
      }))
      return { items: await markInLibrary(movies, libraryProvider) }
    }

    const data = await getTvByGenre(genreId, locale)
    const tv: BrowseItem[] = data.results.slice(0, 20).map((t) => ({
      id: t.id,
      type: 'tv' as const,
      title: t.name,
      overview: t.overview,
      posterUrl: getImageUrl(t.poster_path),
      backdropUrl: getImageUrl(t.backdrop_path, 'original'),
      year: t.first_air_date?.slice(0, 4) ?? '',
      rating: t.vote_average
    }))
    return { items: await markInLibrary(tv, libraryProvider) }
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: `TMDB API error: ${err instanceof Error ? err.message : 'unknown'}`
    })
  }
})
