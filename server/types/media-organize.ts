export type MediaImportMode = 'hardlink' | 'copy' | 'move'

export const MEDIA_IMPORT_MODES: readonly MediaImportMode[] = ['hardlink', 'copy', 'move']

export type OrganizeStatus = 'pending' | 'done' | 'failed' | 'skipped'

export const ORGANIZE_STATUS_VALUES: readonly OrganizeStatus[] = ['pending', 'done', 'failed', 'skipped']

export interface OrganizeMovieInput {
  title: string
  year: number | null
  resolution: string | null
  source: string | null
  extension: string
}

export interface OrganizeEpisodeInput {
  seriesTitle: string
  season: number
  episode: number
  episodeTitle: string | null
  airDate: string | null
  resolution: string | null
  source: string | null
  extension: string
}

export interface OrganizeResult {
  status: OrganizeStatus
  targetRelativePath: string | null
  error: string | null
}

export interface MainFilePick {
  index: number
  name: string
  size: number
}

export type MediaImportMethod = 'hardlink' | 'copy' | 'move'

export interface ImportSingleFileResult {
  method: MediaImportMethod
  bytes: number
}

export interface MediaConfig {
  enabled: boolean
  importMode: MediaImportMode
}

export interface OrganizeJobInput {
  downloadId: string
  savePath: string
  torrentName: string
  label: string
  tmdbId: number | null
  mediaType: 'movie' | 'tv' | null
  resolution: string | null
}
