import { getPopularMovies, getPopularTvShows, getImageUrl } from '#server/utils/tmdb'
import { markInLibrary } from '#server/utils/browse-utils'
import { getActiveSyncProviders } from '#server/utils/sync'
import type { BrowseItem } from '#server/types/browse'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const providers = await getActiveSyncProviders()
  const libraryProvider = providers.find((p) => typeof p.isItemInLibrary === 'function')

  const query = getQuery(event)
  const locale = typeof query.locale === 'string' ? query.locale : 'en'

  try {
    const [movieData, tvData] = await Promise.all([getPopularMovies(locale), getPopularTvShows(locale)])

    const rawMovies: BrowseItem[] = movieData.results.slice(0, 20).map((m) => ({
      id: m.id,
      type: 'movie' as const,
      title: m.title,
      overview: m.overview,
      posterUrl: getImageUrl(m.poster_path),
      backdropUrl: getImageUrl(m.backdrop_path, 'w780'),
      year: m.release_date?.slice(0, 4) ?? '',
      rating: m.vote_average,
      genres: m.genre_ids?.map(String) ?? []
    }))

    const rawTv: BrowseItem[] = tvData.results.slice(0, 20).map((t) => ({
      id: t.id,
      type: 'tv' as const,
      title: t.name,
      overview: t.overview,
      posterUrl: getImageUrl(t.poster_path),
      backdropUrl: getImageUrl(t.backdrop_path, 'w780'),
      year: t.first_air_date?.slice(0, 4) ?? '',
      rating: t.vote_average,
      genres: t.genre_ids?.map(String) ?? []
    }))

    const [movies, tv] = await Promise.all([
      markInLibrary(rawMovies, libraryProvider),
      markInLibrary(rawTv, libraryProvider)
    ])

    return { movies, tv }
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: `TMDB API error: ${err instanceof Error ? err.message : 'unknown'}`
    })
  }
})
