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

export interface TmdbImageLogo {
  file_path: string
  iso_639_1: string | null
}

export interface TmdbImagesResponse {
  logos: TmdbImageLogo[]
}
