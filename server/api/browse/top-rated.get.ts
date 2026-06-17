import { getTopRatedMovies, getImageUrl } from '../../utils/tmdb'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const query = getQuery(event)
  const locale = typeof query.locale === 'string' ? query.locale : 'pl'

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

    return { movies }
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: `TMDB API error: ${err instanceof Error ? err.message : 'unknown'}`
    })
  }
})
