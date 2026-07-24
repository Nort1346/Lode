export interface AutocompleteSuggestion {
  id: number
  title: string
  type: 'movie' | 'tv'
  posterUrl: string | null
  year: string
}
