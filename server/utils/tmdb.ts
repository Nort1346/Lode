import { cacheGet, cacheSet, CACHE_TTL } from './cache'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'

const LOCALE_MAP: Record<string, string> = {
  pl: 'pl-PL',
  en: 'en-US'
}

export function resolveTmdbLanguage(locale: string): string {
  return LOCALE_MAP[locale] ?? 'pl-PL'
}

function resolveTmdbLogoLanguage(locale: string): string {
  const code = resolveTmdbLanguage(locale).split('-')
  return code[0] ?? 'pl'
}

export interface TmdbMovie {
  id: number
  title: string
  original_title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  vote_average: number
  vote_count: number
  genre_ids: number[]
  genres: Array<{ id: number; name: string }>
  runtime: number | null
  imdb_id: string | null
  original_language: string
}

export interface TmdbTvShow {
  id: number
  name: string
  original_name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  vote_average: number
  vote_count: number
  genre_ids: number[]
  genres: Array<{ id: number; name: string }>
  number_of_seasons: number
  number_of_episodes: number
  seasons: TmdbSeason[]
  original_language: string
  external_ids?: { imdb_id: string | null }
}

export interface TmdbSeason {
  id: number
  season_number: number
  name: string
  overview: string
  poster_path: string | null
  air_date: string | null
  episode_count: number
  episodes?: TmdbEpisode[]
}

export interface TmdbEpisode {
  id: number
  episode_number: number
  season_number: number
  name: string
  overview: string
  still_path: string | null
  air_date: string
  vote_average: number
  runtime: number | null
}

export interface TmdbSearchResult<T> {
  page: number
  results: T[]
  total_pages: number
  total_results: number
}

function getApiKey(): string {
  const config = useRuntimeConfig()
  const key = config.tmdbApiKey as string
  if (!key) throw new Error('TMDB API key not configured')
  return key
}

export function getImageUrl(
  path: string | null,
  size: 'w92' | 'w154' | 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original' = 'w342'
): string | null {
  if (path === null) return null
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}

export async function searchMovies(query: string, page = 1, locale = 'pl'): Promise<TmdbSearchResult<TmdbMovie>> {
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
  if (!response.ok) throw new Error(`TMDB API error ${response.status}`)

  const result = (await response.json()) as TmdbSearchResult<TmdbMovie>
  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_POPULAR)
  return result
}

interface TmdbImageLogo {
  iso_639_1: string | null
  file_path: string
}

interface TmdbImagesResponse {
  logos: TmdbImageLogo[]
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

export async function searchTvShows(query: string, page = 1, locale = 'pl'): Promise<TmdbSearchResult<TmdbTvShow>> {
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
  if (!response.ok) throw new Error(`TMDB API error ${response.status}`)

  const result = (await response.json()) as TmdbSearchResult<TmdbTvShow>
  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_SEARCH)
  return result
}

export async function getMovieDetails(id: number, locale = 'pl'): Promise<TmdbMovie> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:movie:${id}:${lang}`
  const cached = await cacheGet<TmdbMovie>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/movie/${id}`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)
  url.searchParams.set('append_to_response', 'external_ids')

  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`TMDB API error ${response.status}`)

  const data = (await response.json()) as TmdbMovie & { external_ids?: { imdb_id: string | null } }
  const result: TmdbMovie = {
    ...data,
    imdb_id: data.external_ids?.imdb_id ?? null
  }

  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_DETAILS)
  return result
}

export async function getTvShowDetails(id: number, locale = 'pl'): Promise<TmdbTvShow> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:tv:${id}:${lang}`
  const cached = await cacheGet<TmdbTvShow>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/tv/${id}`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)
  url.searchParams.set('append_to_response', 'external_ids')

  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`TMDB API error ${response.status}`)

  const data = (await response.json()) as TmdbTvShow
  await cacheSet(cacheKey, data, CACHE_TTL.TMDB_DETAILS)
  return data
}

export async function getSeasonDetails(showId: number, seasonNumber: number, locale = 'pl'): Promise<TmdbSeason> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:tv:${showId}:season:${seasonNumber}:${lang}`
  const cached = await cacheGet<TmdbSeason>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/tv/${showId}/season/${seasonNumber}`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)

  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`TMDB API error ${response.status}`)

  const data = (await response.json()) as TmdbSeason
  await cacheSet(cacheKey, data, CACHE_TTL.TMDB_DETAILS)
  return data
}

export async function getPopularMovies(locale = 'pl', page = 1): Promise<TmdbSearchResult<TmdbMovie>> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:popular:movie:${lang}:${page}`
  const cached = await cacheGet<TmdbSearchResult<TmdbMovie>>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/movie/popular`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)
  url.searchParams.set('page', String(page))

  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`TMDB API error ${response.status}`)

  const result = (await response.json()) as TmdbSearchResult<TmdbMovie>
  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_POPULAR)
  return result
}

export async function getPopularTvShows(locale = 'pl', page = 1): Promise<TmdbSearchResult<TmdbTvShow>> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:popular:tv:${lang}:${page}`
  const cached = await cacheGet<TmdbSearchResult<TmdbTvShow>>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/tv/popular`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)
  url.searchParams.set('page', String(page))

  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`TMDB API error ${response.status}`)

  const result = (await response.json()) as TmdbSearchResult<TmdbTvShow>
  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_POPULAR)
  return result
}

export interface TmdbTrendingItem {
  id: number
  media_type: 'movie' | 'tv'
  title?: string
  name?: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date?: string
  first_air_date?: string
  vote_average: number
  genre_ids: number[]
}

export async function getTrending(locale = 'pl'): Promise<TmdbTrendingItem[]> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:trending:all:week:${locale}`
  const cached = await cacheGet<TmdbTrendingItem[]>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/trending/all/week`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)

  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`TMDB API error ${response.status}`)

  const data = (await response.json()) as { results: TmdbTrendingItem[] }
  await cacheSet(cacheKey, data.results, CACHE_TTL.TMDB_POPULAR)
  return data.results
}

export async function getTopRatedMovies(locale = 'pl', page = 1): Promise<TmdbSearchResult<TmdbMovie>> {
  const lang = resolveTmdbLanguage(locale)
  const cacheKey = `tmdb:top_rated:movie:${lang}:${page}`
  const cached = await cacheGet<TmdbSearchResult<TmdbMovie>>(cacheKey)
  if (cached !== null) return cached

  const url = new URL(`${TMDB_BASE}/movie/top_rated`)
  url.searchParams.set('api_key', getApiKey())
  url.searchParams.set('language', lang)
  url.searchParams.set('page', String(page))

  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`TMDB API error ${response.status}`)

  const result = (await response.json()) as TmdbSearchResult<TmdbMovie>
  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_POPULAR)
  return result
}
