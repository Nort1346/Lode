import type { Genre } from './media'

export type SearchPhase = 'idle' | 'debouncing' | 'loading' | 'success' | 'empty' | 'error'

export interface SearchResultItem {
  id: number
  type: 'movie' | 'tv'
  title: string
  overview: string
  posterUrl: string | null
  backdropUrl: string | null
  year: string
  rating: number
  genres: string[]
  inLibrary: boolean
}

export interface BrowseSearchSource {
  q: () => string
  type: () => string
  genres: () => number[]
  locale: () => string
  fetchResults: (signal: AbortSignal) => Promise<SearchResultItem[]>
}

export interface MovieData {
  id: number
  title: string
  originalTitle: string
  originalLanguage: string
  overview: string
  posterUrl: string | null
  backdropUrl: string | null
  releaseDate: string
  rating: number
  voteCount: number
  runtime: number | null
  genres: Genre[]
  imdbId: string | null
  inLibrary: boolean
}

export interface ShowData {
  id: number
  name: string
  originalName: string
  originalLanguage: string
  overview: string
  posterUrl: string | null
  backdropUrl: string | null
  imdbId: string | null
  firstAirDate: string
  rating: number
  genres: Genre[]
  numberOfSeasons: number
  numberOfEpisodes: number
  inLibrary: boolean
  seasons: Array<{
    id: number
    seasonNumber: number
    name: string
    posterUrl: string | null
    episodeCount: number
  }>
}

export interface Episode {
  id: number
  episodeNumber: number
  name: string
  overview: string
  stillUrl: string | null
  airDate: string
  rating: number
  runtime: number | null
  torrents: import('./media').EpisodeTorrent[]
}

export interface SeasonData {
  season: { seasonNumber: number; name: string; posterUrl: string | null }
  episodes: Episode[]
  seasonPacks: import('./media').SeasonPack[]
}
