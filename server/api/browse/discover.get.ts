import { getMoviesByGenre, getTvByGenre, getImageUrl } from '#server/utils/tmdb'
import { cacheGet, cacheSet, CACHE_TTL } from '#server/utils/cache'
import { markInLibrary } from '#server/utils/browse-utils'
import { getActiveSyncProviders } from '#server/utils/sync'
import type { BrowseItem } from '#server/types/browse'

function parseIds(param: unknown): number[] {
  if (typeof param !== 'string' || param.length === 0) return []
  return param
    .split(',')
    .map(Number)
    .filter((n) => !Number.isNaN(n) && n > 0)
}

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const providers = await getActiveSyncProviders()
  const libraryProvider = providers.find((p) => typeof p.isItemInLibrary === 'function')

  const query = getQuery(event)
  const locale = typeof query.locale === 'string' ? query.locale : 'pl'
  const type = typeof query.type === 'string' ? query.type : 'all'
  const movieGenreIds = parseIds(query.movieGenre)
  const tvGenreIds = parseIds(query.tvGenre)

  if (movieGenreIds.length === 0 && tvGenreIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one genre ID is required' })
  }

  const allIds = [...movieGenreIds, ...tvGenreIds].sort((a, b) => a - b)
  const cacheKey = `tmdb:discover:${allIds.join(',')}:${type}:${locale}`

  const cached = await cacheGet<BrowseItem[]>(cacheKey)
  if (cached !== null) {
    return { results: await markInLibrary(cached, libraryProvider) }
  }

  try {
    const fetches: Promise<BrowseItem[]>[] = []

    if (type === 'all' || type === 'movie') {
      for (const genreId of movieGenreIds) {
        fetches.push(
          getMoviesByGenre(genreId, locale).then((data) =>
            data.results.map((m) => ({
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
          )
        )
      }
    }

    if (type === 'all' || type === 'tv') {
      for (const genreId of tvGenreIds) {
        fetches.push(
          getTvByGenre(genreId, locale).then((data) =>
            data.results.map((t) => ({
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
          )
        )
      }
    }

    const batches = await Promise.all(fetches)

    const seen = new Set<string>()
    const results: BrowseItem[] = []

    for (const batch of batches) {
      for (const item of batch) {
        const key = `${item.type}-${item.id}`
        if (seen.has(key)) continue
        seen.add(key)
        results.push(item)
      }
    }

    results.sort((a, b) => b.rating - a.rating)

    await cacheSet(cacheKey, results, CACHE_TTL.TMDB_GENRE)

    return { results: await markInLibrary(results, libraryProvider) }
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: `TMDB API error: ${err instanceof Error ? err.message : 'unknown'}`
    })
  }
})
