import { getMovieDetails, getImageUrl } from '../../../utils/tmdb'

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

  let movie
  try {
    movie = await getMovieDetails(id, locale)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Failed to fetch movie details from TMDB' })
  }

  return {
    movie: {
      id: movie.id,
      title: movie.title,
      originalTitle: movie.original_title,
      overview: movie.overview,
      posterUrl: getImageUrl(movie.poster_path, 'w780'),
      backdropUrl: getImageUrl(movie.backdrop_path, 'original'),
      releaseDate: movie.release_date,
      rating: movie.vote_average,
      voteCount: movie.vote_count,
      runtime: movie.runtime,
      genres: movie.genres,
      imdbId: movie.imdb_id
    }
  }
})
