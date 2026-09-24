// Wire events for the torrent search SSE streams
// (/api/browse/movie/:id/torrents-stream and
// /api/browse/tv/:id/season/:season/torrents-stream). Every event is a single
// `data:` JSON message discriminated on `type`; the stream always ends with a
// terminal `done` or `error` event, after which the server closes the response.

export interface TorrentSearchLimitInfo {
  activeCount: number
  todayCount: number
  limit: number
}

export interface TorrentStreamStartEvent {
  type: 'start'
  // Number of text ladder queries after the per-name and total caps. A second
  // `start` arrives when the TV endpoint retries with the original name.
  queries: number
}

export type TorrentStreamQueryEvent =
  | { type: 'query'; state: 'start' | 'skipped'; index: number; total: number; text: string }
  | { type: 'query'; state: 'done'; index: number; total: number; text: string; results: number }

export interface TorrentStreamImdbEvent {
  type: 'imdb'
  results: number
}

export interface TorrentStreamDoneEvent<T = unknown> {
  type: 'done'
  // Final ranked result count (0 when the search came up empty)
  found: number
  // The exact payload the equivalent JSON endpoint returns
  data: T
}

export type TorrentStreamErrorEvent =
  | { type: 'error'; code: 'limit'; status: 429; data: TorrentSearchLimitInfo }
  | { type: 'error'; code: 'details'; status: 502 }

export type TorrentStreamEvent =
  | TorrentStreamStartEvent
  | TorrentStreamQueryEvent
  | TorrentStreamImdbEvent
  | TorrentStreamDoneEvent
  | TorrentStreamErrorEvent

// Stream timing: keepalive keeps proxies from killing a slow search; the
// reconnect bounds are the client's drop-recovery backoff; stale is the
// client-side watchdog so the indicator can never hang on a silent server.
export const TORRENT_STREAM_KEEPALIVE_MS = 15000
export const TORRENT_STREAM_RECONNECT_BASE_MS = 2000
export const TORRENT_STREAM_RECONNECT_MAX_MS = 10000
export const TORRENT_STREAM_STALE_MS = 60000

// Payload shapes shared by the JSON endpoints and their SSE siblings

export interface TorrentSearchTorrent {
  title: string
  size: number
  sizeFormatted: string
  seeders: number
  leechers: number
  indexer: string
  magnetLink: string | null
  downloadUrl: string | null
  guid: string | null
  score: number
  percentage: number
  recommended: boolean
  resolution: string | null
  source: string | null
  language: string | null
  isPrivate: boolean
}

export interface EpisodeTorrentPayload {
  title: string
  size: number
  sizeFormatted: string
  seeders: number
  leechers: number
  indexer: string
  magnetLink: string | null
  downloadUrl: string | null
  guid: string | null
  score: number
  percentage: number
  recommended: boolean
  resolution: string | null
  language: string | null
  isPrivate: boolean
}

export interface SeasonPackPayload extends EpisodeTorrentPayload {
  isSeasonPack: boolean
}

export interface EpisodePayload {
  id: number
  episodeNumber: number
  name: string
  overview: string
  stillUrl: string | null
  airDate: string | null
  rating: number
  runtime: number | null
  torrents: EpisodeTorrentPayload[]
}

export interface SeasonSearchPayload {
  show: { id: number; name: string }
  season: {
    seasonNumber: number
    name: string
    overview: string
    posterUrl: string | null
    airDate: string | null
  }
  episodes: EpisodePayload[]
  seasonPacks: SeasonPackPayload[]
}

export interface MovieSearchPayload {
  torrents: TorrentSearchTorrent[]
}

// Outcomes of the shared search orchestration (server/utils/torrents/torrent-search.ts)

export type MovieTorrentsOutcome =
  { kind: 'details-failed' } | { kind: 'ok'; payload: MovieSearchPayload; found: number }

export type SeasonTorrentsOutcome =
  { kind: 'details-failed' } | { kind: 'ok'; payload: SeasonSearchPayload; found: number }
