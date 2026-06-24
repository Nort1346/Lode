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
}

export interface SpotlightGenreEntry {
  type: 'movie' | 'tv'
  id: number
}
