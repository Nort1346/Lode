import type { LibraryMediaType, LibrarySortKey } from '#shared/library'

export interface LibraryTab {
  value: LibraryMediaType
  label: string
  icon: string
  count: number
}

export interface LibrarySortOption {
  value: LibrarySortKey
  label: string
}

export type LibraryStatKey = 'movies' | 'series' | 'episodes' | 'genres'

export interface LibraryStat {
  key: LibraryStatKey
  label: string
  value: number
  icon: string
}
