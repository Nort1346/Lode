import { getTvShowDetails, getImageUrl } from '../../../utils/tmdb'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const id = Number(getRouterParam(event, 'id'))
  if (isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid TV show ID' })
  }

  const locale = (getQuery(event).locale as string | undefined) ?? 'pl'

  let show
  try {
    show = await getTvShowDetails(id, locale)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Failed to fetch TV show details from TMDB' })
  }

  return {
    show: {
      id: show.id,
      name: show.name,
      originalName: show.original_name,
      overview: show.overview,
      posterUrl: getImageUrl(show.poster_path, 'w780'),
      backdropUrl: getImageUrl(show.backdrop_path, 'original'),
      firstAirDate: show.first_air_date,
      rating: show.vote_average,
      voteCount: show.vote_count,
      genres: show.genres,
      numberOfSeasons: show.number_of_seasons,
      numberOfEpisodes: show.number_of_episodes,
      seasons: show.seasons
        .filter((s) => s.season_number > 0)
        .map((s) => ({
          id: s.id,
          seasonNumber: s.season_number,
          name: s.name,
          overview: s.overview,
          posterUrl: getImageUrl(s.poster_path),
          airDate: s.air_date,
          episodeCount: s.episode_count
        }))
    }
  }
})
