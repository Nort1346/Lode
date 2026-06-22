export interface MediaCarouselItem {
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

export interface BaseTorrentInfo {
  title: string
  size: number
  sizeFormatted: string
  seeders: number
  leechers: number
  magnetLink: string | null
  downloadUrl: string | null
  guid: string | null
  indexer: string
  resolution: string | null
  language: string | null
  isPrivate: boolean
  percentage: number
}

export interface Torrent extends BaseTorrentInfo {
  score: number
  recommended: boolean
  source: string | null
}

export interface EpisodeTorrent extends BaseTorrentInfo {
  score: number
  recommended: boolean
}

export interface SeasonPack extends BaseTorrentInfo {
  isSeasonPack: boolean
}

export type Genre = { id: number; name: string }
