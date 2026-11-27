// Shapes shared by the media library endpoint and the Library page. The
// server normalizes each provider's DTOs into these items so the UI never has
// to know about provider-specific field names, ticks or image tags.

export const LIBRARY_MEDIA_TYPES = ['movie', 'series'] as const
export type LibraryMediaType = (typeof LIBRARY_MEDIA_TYPES)[number]

export const LIBRARY_SORT_KEYS = ['title', 'added', 'year', 'rating', 'runtime'] as const
export type LibrarySortKey = (typeof LIBRARY_SORT_KEYS)[number]

export const LIBRARY_SORT_DIRECTIONS = ['asc', 'desc'] as const
export type LibrarySortDirection = (typeof LIBRARY_SORT_DIRECTIONS)[number]

export interface LibraryItem {
  id: string
  type: LibraryMediaType
  title: string
  originalTitle: string | null
  year: number | null
  overview: string
  rating: number | null
  officialRating: string | null
  /** Whole minutes; null when the media server has no runtime for the item. */
  runtimeMinutes: number | null
  /** Episodes in the series (Jellyfin RecursiveItemCount); null for movies. */
  episodeCount: number | null
  /** Seasons in the series (Jellyfin ChildCount); null for movies. */
  seasonCount: number | null
  genres: string[]
  posterUrl: string | null
  backdropUrl: string | null
  addedAt: string | null
}

export interface LibraryStats {
  movies: number
  series: number
  episodes: number
  genres: number
}

export interface LibraryResponse {
  configured: boolean
  connected: boolean
  fetchedAt: string
  items: LibraryItem[]
  stats: LibraryStats
}

export function emptyLibraryStats(): LibraryStats {
  return { movies: 0, series: 0, episodes: 0, genres: 0 }
}

export function isLibraryMediaType(value: unknown): value is LibraryMediaType {
  return typeof value === 'string' && (LIBRARY_MEDIA_TYPES as readonly string[]).includes(value)
}

export function isLibrarySortKey(value: unknown): value is LibrarySortKey {
  return typeof value === 'string' && (LIBRARY_SORT_KEYS as readonly string[]).includes(value)
}

export function isLibrarySortDirection(value: unknown): value is LibrarySortDirection {
  return typeof value === 'string' && (LIBRARY_SORT_DIRECTIONS as readonly string[]).includes(value)
}
