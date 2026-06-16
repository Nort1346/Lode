import { getMovieDetails, getImageUrl } from '../../../utils/tmdb'
import { useProwlarr } from '../../../utils/prowlarr'
import { rankTorrents, formatSize } from '../../../utils/torrent-ranker'

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

  let torrents: ReturnType<typeof rankTorrents> = []
  const prowlarr = useProwlarr()
  if (prowlarr !== null) {
    try {
      const year = movie.release_date?.slice(0, 4) ?? ''
      let rawResults = await prowlarr.searchByQuery(`${movie.title} ${year}`.trim(), locale)
      if (rawResults.length === 0 && movie.original_title !== movie.title) {
        rawResults = await prowlarr.searchByQuery(`${movie.original_title} ${year}`.trim(), locale)
      }
      torrents = rankTorrents(rawResults, 'movie', movie.title, year)
    } catch {
      // Prowlarr might be offline, return empty torrents
    }
  }

  return {
    movie: {
      id: movie.id,
      title: movie.title,
      originalTitle: movie.original_title,
      overview: movie.overview,
      posterUrl: getImageUrl(movie.poster_path, 'w780'),
      backdropUrl: getImageUrl(movie.backdrop_path, 'w1280'),
      releaseDate: movie.release_date,
      rating: movie.vote_average,
      voteCount: movie.vote_count,
      runtime: movie.runtime,
      genres: movie.genres,
      imdbId: movie.imdb_id
    },
    torrents: torrents.map((t) => ({
      title: t.title,
      size: t.size,
      sizeFormatted: formatSize(t.size),
      seeders: t.seeders,
      leechers: t.leechers,
      indexer: t.indexer,
      magnetLink: t.magnetLink,
      downloadUrl: t.downloadUrl,
      guid: t.guid,
      score: t.score,
      recommended: t.recommended,
      resolution: t.parsed.resolution,
      source: t.parsed.source,
      language: t.parsed.language
    }))
  }
})
