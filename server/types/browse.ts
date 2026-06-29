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
  year: string
  rating: number
  genres: string[]
}
