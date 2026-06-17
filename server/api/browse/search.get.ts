import { searchMovies, searchTvShows, getImageUrl } from '#server/utils/tmdb'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const type = typeof query.type === 'string' ? query.type : 'all'
  const page = typeof query.page === 'string' ? Number(query.page) : 1
  const locale = typeof query.locale === 'string' ? query.locale : 'pl'

  if (q.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Search query must be at least 2 characters' })
  }

  const results: Array<{
    id: number
    type: 'movie' | 'tv'
    title: string
    overview: string
    posterUrl: string | null
    backdropUrl: string | null
    year: string
    rating: number
    genres: string[]
  }> = []

  try {
    if (type === 'all' || type === 'movie') {
      const movieResults = await searchMovies(q, page, locale)
      for (const m of movieResults.results) {
        results.push({
          id: m.id,
          type: 'movie',
          title: m.title,
          overview: m.overview,
          posterUrl: getImageUrl(m.poster_path),
          backdropUrl: getImageUrl(m.backdrop_path, 'w780'),
          year: m.release_date?.slice(0, 4) ?? '',
          rating: m.vote_average,
          genres: m.genre_ids?.map(String) ?? []
        })
      }
    }

    if (type === 'all' || type === 'tv') {
      const tvResults = await searchTvShows(q, page, locale)
      for (const t of tvResults.results) {
        results.push({
          id: t.id,
          type: 'tv',
          title: t.name,
          overview: t.overview,
          posterUrl: getImageUrl(t.poster_path),
          backdropUrl: getImageUrl(t.backdrop_path, 'w780'),
          year: t.first_air_date?.slice(0, 4) ?? '',
          rating: t.vote_average,
          genres: t.genre_ids?.map(String) ?? []
        })
      }
    }
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: `TMDB API error: ${err instanceof Error ? err.message : 'unknown'}`
    })
  }

  results.sort((a, b) => b.rating - a.rating)

  return { results, query: q, page }
})
