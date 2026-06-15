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
  await cacheSet(cacheKey, result, CACHE_TTL.TMDB_SEARCH)
  return result
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
