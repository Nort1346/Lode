import type { APIContainerComponent, APITextDisplayComponent } from 'discord-api-types/v10'

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
  resolution: string | null
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

export type TextTranslator = (key: string) => string

export interface ComponentsPayload {
  components: (APIContainerComponent | APITextDisplayComponent)[]
  flags: number
  allowed_mentions: { parse: string[]; users?: string[] }
}

export interface OutgoingFile {
  data: Buffer
  name: string
  contentType: 'image/png'
}

/** Minimal download row projection needed to dispatch a completion webhook. */
export interface DiscordDownloadNotifyInput {
  id: string
  label: string
  torrentName: string
  savePath: string
  sizeBytes: number
  completedAt: string | null
  tmdbId: number | null
  mediaType: string | null
  userId: string
  resolution: string | null
}
