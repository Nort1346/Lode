import { getMoviesByGenre, getTvByGenre, getImageUrl } from '#server/utils/tmdb'
import { cacheGet, cacheSet, CACHE_TTL } from '#server/utils/cache'
import { fisherYatesShuffle } from '#server/utils/shuffle'
import type { SpotlightItem, SpotlightGenreEntry } from '#server/types/browse'
import { SupportedLocale, DEFAULT_LOCALE } from '~/types/locale'

const GENRE_POOL: SpotlightGenreEntry[] = [
  { type: 'movie', id: 28 },
  { type: 'movie', id: 12 },
  { type: 'movie', id: 35 },
  { type: 'movie', id: 18 },
  { type: 'movie', id: 878 },
  { type: 'movie', id: 27 },
  { type: 'movie', id: 53 },
  { type: 'movie', id: 16 },
  { type: 'tv', id: 10759 },
  { type: 'tv', id: 35 },
  { type: 'tv', id: 18 },
  { type: 'tv', id: 10765 },
  { type: 'tv', id: 80 },
  { type: 'tv', id: 10762 }
]

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const query = getQuery(event)
  const localeParam = query.locale
  const locale: SupportedLocale =
    typeof localeParam === 'string' && Object.values(SupportedLocale).includes(localeParam as SupportedLocale)
      ? (localeParam as SupportedLocale)
      : DEFAULT_LOCALE

  const poolKey = `tmdb:spotlights:pool:${locale}`

  let pool = await cacheGet<SpotlightItem[]>(poolKey)

  if (pool === null) {
    try {
      const picked = fisherYatesShuffle(GENRE_POOL).slice(0, 5)

      const batchResults = await Promise.all(
        picked.map(async (g) => {
          if (g.type === 'movie') {
            const data = await getMoviesByGenre(g.id, locale)
            return data.results.slice(0, 20).map((m) => {
              const backdropUrl = getImageUrl(m.backdrop_path, 'original')
              if (backdropUrl === null) return null
              return {
                id: m.id,
                type: 'movie' as const,
                title: m.title,
                overview: m.overview,
                posterUrl: getImageUrl(m.poster_path),
                backdropUrl,
                logoUrl: null as null,
                year: m.release_date?.slice(0, 4) ?? '',
                rating: m.vote_average
              } satisfies SpotlightItem
            })
          }

          const data = await getTvByGenre(g.id, locale)
          return data.results.slice(0, 20).map((t) => {
            const backdropUrl = getImageUrl(t.backdrop_path, 'original')
            if (backdropUrl === null) return null
            return {
              id: t.id,
              type: 'tv' as const,
              title: t.name,
              overview: t.overview,
              posterUrl: getImageUrl(t.poster_path),
              backdropUrl,
              logoUrl: null as null,
              year: t.first_air_date?.slice(0, 4) ?? '',
              rating: t.vote_average
            } satisfies SpotlightItem
          })
        })
      )

      const seen = new Set<string>()
      pool = []

      for (const batch of batchResults) {
        for (const item of batch) {
          if (item === null) continue
          const key = `${item.type}-${item.id}`
          if (seen.has(key)) continue
          seen.add(key)
          pool.push(item)
        }
      }

      await cacheSet(poolKey, pool, CACHE_TTL.TMDB_GENRE)
    } catch (err) {
      throw createError({
        statusCode: 502,
        statusMessage: `TMDB API error: ${err instanceof Error ? err.message : 'unknown'}`
      })
    }
  }

  const spotlights = fisherYatesShuffle(pool).slice(0, 5)
  return { items: spotlights }
})
