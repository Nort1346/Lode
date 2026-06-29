import { searchMovies, searchTvShows, getImageUrl } from '#server/utils/tmdb'
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
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const type = typeof query.type === 'string' ? query.type : 'all'
  const page = typeof query.page === 'string' ? Number(query.page) : 1
  const locale = typeof query.locale === 'string' ? query.locale : 'pl'
  const movieGenreParam = typeof query.movieGenre === 'string' ? query.movieGenre : ''
  const tvGenreParam = typeof query.tvGenre === 'string' ? query.tvGenre : ''
  const movieGenreIds = movieGenreParam
    ? movieGenreParam
        .split(',')
        .map(Number)
        .filter((n) => !Number.isNaN(n) && n > 0)
    : []
  const tvGenreIds = tvGenreParam
    ? tvGenreParam
        .split(',')
        .map(Number)
        .filter((n) => !Number.isNaN(n) && n > 0)
    : []

  if (q.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Search query must be at least 2 characters' })
  }

  const results: BrowseItem[] = []

  try {
    if (type === 'all' || type === 'movie') {
      const movieResults = await searchMovies(q, page, locale)
      let movies: BrowseItem[] = movieResults.results.map((m) => ({
        id: m.id,
        type: 'movie',
        title: m.title,
        overview: m.overview,
        posterUrl: getImageUrl(m.poster_path),
        backdropUrl: getImageUrl(m.backdrop_path, 'w780'),
        year: m.release_date?.slice(0, 4) ?? '',
        rating: m.vote_average,
        genres: m.genre_ids?.map(String) ?? []
      }))
      if (movieGenreIds.length > 0) {
        movies = movies.filter((m) => m.genres.some((g) => movieGenreIds.includes(Number(g))))
      }
      results.push(...movies)
    }

    if (type === 'all' || type === 'tv') {
      const tvResults = await searchTvShows(q, page, locale)
      let tv: BrowseItem[] = tvResults.results.map((t) => ({
        id: t.id,
        type: 'tv',
        title: t.name,
        overview: t.overview,
        posterUrl: getImageUrl(t.poster_path),
        backdropUrl: getImageUrl(t.backdrop_path, 'w780'),
        year: t.first_air_date?.slice(0, 4) ?? '',
        rating: t.vote_average,
        genres: t.genre_ids?.map(String) ?? []
      }))
      if (tvGenreIds.length > 0) {
        tv = tv.filter((t) => t.genres.some((g) => tvGenreIds.includes(Number(g))))
      }
      results.push(...tv)
    }
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: `TMDB API error: ${err instanceof Error ? err.message : 'unknown'}`
    })
  }

  results.sort((a, b) => b.rating - a.rating)

  const marked = await markInLibrary(results, libraryProvider)

  return { results: marked, query: q, page }
})
