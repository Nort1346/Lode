export interface SpotlightItem {
  id: number
  type: 'movie' | 'tv'
  title: string
  overview: string
  posterUrl: string | null
  backdropUrl: string | null
  logoUrl: null
  year: string
  rating: number
  inLibrary: boolean
}

export interface SpotlightGenreEntry {
  type: 'movie' | 'tv'
  id: number
}

export interface BrowseItem {
  id: number
  type: 'movie' | 'tv'
  title: string
  overview: string
  posterUrl: string | null
  backdropUrl: string | null
  logoUrl?: string | null
  year: string
  rating: number
  genres: string[]
}

export interface TrendingItem {
  id: number
  type: 'movie' | 'tv'
  title: string
  overview: string
  posterUrl: string | null
  backdropUrl: string | null
  logoUrl: string | null
  year: string
  rating: number
}

export interface DownloadBody {
  magnetLink?: string
  downloadUrl?: string
  guid?: string
  indexer?: string
  label: string
  savePath: string
  tmdbId?: number
  mediaType?: string
}
