import { getTvShowDetails, getImageUrl } from '#server/utils/tmdb'
import { markInLibrary } from '#server/utils/browse-utils'
import { getActiveSyncProviders } from '#server/utils/sync'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const providers = await getActiveSyncProviders()
  const libraryProvider = providers.find((p) => typeof p.isItemInLibrary === 'function')

  const id = Number(getRouterParam(event, 'id'))
  if (isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid TV show ID' })
  }

  const locale = (getQuery(event).locale as string | undefined) ?? 'en'

  let show
  try {
    show = await getTvShowDetails(id, locale)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Failed to fetch TV show details from TMDB' })
  }

  const rawShow = {
    id: show.id,
    name: show.name,
    originalName: show.original_name,
    originalLanguage: show.original_language,
    overview: show.overview,
    posterUrl: getImageUrl(show.poster_path, 'w780'),
    backdropUrl: getImageUrl(show.backdrop_path, 'original'),
    imdbId: (show as unknown as { external_ids?: { imdb_id?: string } }).external_ids?.imdb_id ?? null,
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

  const [marked] = await markInLibrary([rawShow], libraryProvider)

  return { show: marked }
})
