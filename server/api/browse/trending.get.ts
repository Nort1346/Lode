import { getTrending, getImageUrl } from '../../utils/tmdb'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  type TrendingItem = {
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
    const items = await getTrending()

    const results: TrendingItem[] = items.slice(0, 20).map((item) => ({
      id: item.id,
      type: item.media_type,
      title: item.title ?? item.name ?? '',
      overview: item.overview,
      posterUrl: getImageUrl(item.poster_path),
      backdropUrl: getImageUrl(item.backdrop_path, 'w780'),
      year: (item.release_date ?? item.first_air_date ?? '').slice(0, 4),
      rating: item.vote_average
    }))

    return { items: results }
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: `TMDB API error: ${err instanceof Error ? err.message : 'unknown'}`
    })
  }
})
