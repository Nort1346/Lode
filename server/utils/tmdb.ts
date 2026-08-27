import { createError } from 'h3'
import { cacheGet, cacheSet, CACHE_TTL } from './cache'
import type {
  TmdbMovie,
  TmdbTvShow,
  TmdbSeason,
  TmdbSearchResult,
  TmdbTrendingItem,
  TmdbImagesResponse
} from '#server/types/tmdb'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'

const TMDB_BCP47_MAP: Record<string, string> = {
  pl: 'pl-PL',
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES'
}

export function resolveTmdbLanguage(locale: string): string {
  if (locale === 'original') return ''
  if (locale.includes('-')) {
    const shortCode = locale.split('-')[0] ?? locale
    return TMDB_BCP47_MAP[shortCode] ?? locale
  }
  return TMDB_BCP47_MAP[locale] ?? 'en-US'
}

function resolveTmdbLogoLanguage(locale: string): string {
  const code = resolveTmdbLanguage(locale).split('-')
  return code[0] ?? 'en'
}

function getApiKey(): string {
  const config = useRuntimeConfig()
  const key = (config.tmdbApiKey as string) || ''
  if (!key) {
    throw createError({
      statusCode: 503,
      statusMessage: 'TMDB is not configured. Set NUXT_TMDB_API_KEY and restart the server.'
    })
  }
  return key
}

function throwTmdbError(response: Response): never {
  if (response.status === 401) {
    throw createError({
      statusCode: 503,
      statusMessage: 'TMDB API key was rejected. Check NUXT_TMDB_API_KEY.'
    })
  }
  throw createError({
    statusCode: 502,
    statusMessage: `TMDB API error ${response.status}`
  })
}

export function getImageUrl(
  path: string | null,
  size: 'w92' | 'w154' | 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original' = 'w342'
): string | null {
  if (path === null) return null
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}

export async function searchMovies(query: string, page = 1, locale = 'en'): Promise<TmdbSearchResult<TmdbMovie>> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:search:movie:${query}:${page}:${lang}`
  const cached = await cacheGet<TmdbSearchResult<TmdbMovie>>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/search/movie`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)
  url.searchParams.set('query', query)
  url.searchParams.set('page', String(page))

  const response = await fetch(url.toString())
  if (!response.ok) throwTmdbError(response)

  const result = (await response.json()) as TmdbSearchResult<TmdbMovie>
  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_POPULAR)
  return result
}

export async function getLogosForItems(
  items: Array<{ id: number; media_type: string }>,
  locale: string
): Promise<Map<number, string | null>> {
  const lang = resolveTmdbLanguage(locale)
  const logoLang = resolveTmdbLogoLanguage(locale)
  const logoMap = new Map<number, string | null>()
  const CONCURRENCY = 5
  const LOGO_TTL = 86400
  const NO_LOGO = '__none__'

  const uncached: Array<{ id: number; media_type: string }> = []

  for (const item of items) {
    const type = item.media_type === 'tv' ? 'tv' : 'movie'
    const cacheKey = `tmdb:logo:${type}:${item.id}:${lang}`
    const cached = await cacheGet<string>(cacheKey)
    if (cached !== null) {
      logoMap.set(item.id, cached === NO_LOGO ? null : cached)
    } else {
      uncached.push(item)
    }
  }

  if (uncached.length === 0) return logoMap

  for (let i = 0; i < uncached.length; i += CONCURRENCY) {
    const batch = uncached.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const type = item.media_type === 'tv' ? 'tv' : 'movie'
        const cacheKey = `tmdb:logo:${type}:${item.id}:${lang}`

        const url = new URL(`${TMDB_BASE}/${type}/${item.id}/images`)
        url.searchParams.set('api_key', getApiKey())
        url.searchParams.set('include_image_language', `${logoLang},null`)

        const response = await fetch(url.toString())
        if (!response.ok) {
          await cacheSet(cacheKey, NO_LOGO, LOGO_TTL)
          return { id: item.id, logo: null as string | null }
        }

        const data = (await response.json()) as TmdbImagesResponse
        const logos = data.logos ?? []

        let picked: string | null = null
        const langMatch = logos.find((l) => l.iso_639_1 === logoLang)
        if (langMatch) {
          picked = langMatch.file_path
        } else {
          const nullMatch = logos.find((l) => l.iso_639_1 === null)
          if (nullMatch) {
            picked = nullMatch.file_path
          }
        }

        const logoUrl = picked !== null ? getImageUrl(picked, 'original') : null
        await cacheSet(cacheKey, logoUrl ?? NO_LOGO, LOGO_TTL)
        return { id: item.id, logo: logoUrl }
      })
    )

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value !== undefined) {
        logoMap.set(r.value.id, r.value.logo)
      }
    }
  }

  return logoMap
}

export async function searchTvShows(query: string, page = 1, locale = 'en'): Promise<TmdbSearchResult<TmdbTvShow>> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:search:tv:${query}:${page}:${lang}`
  const cached = await cacheGet<TmdbSearchResult<TmdbTvShow>>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/search/tv`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)
  url.searchParams.set('query', query)
  url.searchParams.set('page', String(page))

  const response = await fetch(url.toString())
  if (!response.ok) throwTmdbError(response)

  const result = (await response.json()) as TmdbSearchResult<TmdbTvShow>
  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_SEARCH)
  return result
}

export async function getMovieDetails(id: number, locale = 'en'): Promise<TmdbMovie> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:movie:${id}:${lang}`
  const cached = await cacheGet<TmdbMovie>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/movie/${id}`)
  url.searchParams.set('api_key', getApiKey())
  if (lang) url.searchParams.set('language', lang)
  url.searchParams.set('append_to_response', 'external_ids')

  const response = await fetch(url.toString())
  if (!response.ok) throwTmdbError(response)

  const data = (await response.json()) as TmdbMovie & { external_ids?: { imdb_id: string | null } }
  const result: TmdbMovie = {
    ...data,
    imdb_id: data.external_ids?.imdb_id ?? null
  }

  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_DETAILS)
  return result
}

export async function getTvShowDetails(id: number, locale = 'en'): Promise<TmdbTvShow> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:tv:${id}:${lang}`
  const cached = await cacheGet<TmdbTvShow>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/tv/${id}`)
  url.searchParams.set('api_key', getApiKey())
  if (lang) url.searchParams.set('language', lang)
  url.searchParams.set('append_to_response', 'external_ids')

  const response = await fetch(url.toString())
  if (!response.ok) throwTmdbError(response)

  const data = (await response.json()) as TmdbTvShow
  await cacheSet(cacheKey, data, CACHE_TTL.TMDB_DETAILS)
  return data
}

export async function getSeasonDetails(showId: number, seasonNumber: number, locale = 'en'): Promise<TmdbSeason> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:tv:${showId}:season:${seasonNumber}:${lang}`
  const cached = await cacheGet<TmdbSeason>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/tv/${showId}/season/${seasonNumber}`)
  url.searchParams.set('api_key', getApiKey())
  if (lang) url.searchParams.set('language', lang)

  const response = await fetch(url.toString())
  if (!response.ok) throwTmdbError(response)

  const data = (await response.json()) as TmdbSeason
  await cacheSet(cacheKey, data, CACHE_TTL.TMDB_DETAILS)
  return data
}

export async function getPopularMovies(locale = 'en', page = 1): Promise<TmdbSearchResult<TmdbMovie>> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:popular:movie:${lang}:${page}`
  const cached = await cacheGet<TmdbSearchResult<TmdbMovie>>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/movie/popular`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)
  url.searchParams.set('page', String(page))

  const response = await fetch(url.toString())
  if (!response.ok) throwTmdbError(response)

  const result = (await response.json()) as TmdbSearchResult<TmdbMovie>
  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_POPULAR)
  return result
}

export async function getPopularTvShows(locale = 'en', page = 1): Promise<TmdbSearchResult<TmdbTvShow>> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:popular:tv:${lang}:${page}`
  const cached = await cacheGet<TmdbSearchResult<TmdbTvShow>>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/tv/popular`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)
  url.searchParams.set('page', String(page))

  const response = await fetch(url.toString())
  if (!response.ok) throwTmdbError(response)

  const result = (await response.json()) as TmdbSearchResult<TmdbTvShow>
  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_POPULAR)
  return result
}

export async function getTrending(locale = 'en'): Promise<TmdbTrendingItem[]> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:trending:all:week:${locale}`
  const cached = await cacheGet<TmdbTrendingItem[]>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/trending/all/week`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)

  const response = await fetch(url.toString())
  if (!response.ok) throwTmdbError(response)

  const data = (await response.json()) as { results: TmdbTrendingItem[] }
  await cacheSet(cacheKey, data.results, CACHE_TTL.TMDB_POPULAR)
  return data.results
}

export async function getTopRatedMovies(locale = 'en', page = 1): Promise<TmdbSearchResult<TmdbMovie>> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:top_rated:movie:${lang}:${page}`
  const cached = await cacheGet<TmdbSearchResult<TmdbMovie>>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/movie/top_rated`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)
  url.searchParams.set('page', String(page))

  const response = await fetch(url.toString())
  if (!response.ok) throwTmdbError(response)

  const result = (await response.json()) as TmdbSearchResult<TmdbMovie>
  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_POPULAR)
  return result
}

export async function getMoviesByGenre(genreId: number, locale = 'en', page = 1): Promise<TmdbSearchResult<TmdbMovie>> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:genre:movie:${genreId}:${lang}:${page}`
  const cached = await cacheGet<TmdbSearchResult<TmdbMovie>>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/discover/movie`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)
  url.searchParams.set('with_genres', String(genreId))
  url.searchParams.set('sort_by', 'vote_count.desc')
  url.searchParams.set('vote_count.gte', '100')
  url.searchParams.set('page', String(page))

  const response = await fetch(url.toString())
  if (!response.ok) throwTmdbError(response)

  const result = (await response.json()) as TmdbSearchResult<TmdbMovie>
  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_GENRE)
  return result
}

export async function getTvByGenre(genreId: number, locale = 'en', page = 1): Promise<TmdbSearchResult<TmdbTvShow>> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:genre:tv:${genreId}:${lang}:${page}`
  const cached = await cacheGet<TmdbSearchResult<TmdbTvShow>>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/discover/tv`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)
  url.searchParams.set('with_genres', String(genreId))
  url.searchParams.set('sort_by', 'vote_count.desc')
  url.searchParams.set('vote_count.gte', '100')
  url.searchParams.set('page', String(page))

  const response = await fetch(url.toString())
  if (!response.ok) throwTmdbError(response)

  const result = (await response.json()) as TmdbSearchResult<TmdbTvShow>
  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_GENRE)
  return result
}
