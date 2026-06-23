export interface DownloadCompleteData {
  id: string
  label: string
  torrentName: string
  savePath: string
  sizeBytes: number
  completedAt: string
  username: string
  tmdbId: number | null
  mediaType: string | null
  discordId: string | null
}

export interface TmdbMeta {
  title: string
  overview: string
  posterUrl: string | null
  backdropUrl: string | null
  runtime: number | null
  genres: string[]
  voteAverage: number
  releaseDate: string
}

export interface RequestPendingData {
  id: string
  mediaType: 'movie' | 'tv'
  mediaId: number
  mediaTitle: string
  mediaPoster: string | null
  username: string
  userNote: string | null
}
