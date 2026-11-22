export type EpisodeKind =
  | 'episode'
  | 'multi-episode'
  | 'episode-pack'
  | 'season-pack'
  | 'multiseason-pack'
  | 'complete-series'
  | 'daily'
  | 'absolute'
  | 'unknown'

export interface EpisodeInfo {
  kind: EpisodeKind
  seasons: number[]
  episodes: number[]
  airDate: string | null
}
