export type MediaImportMode = 'hardlink' | 'copy' | 'move'

export const MEDIA_IMPORT_MODES: readonly MediaImportMode[] = ['hardlink', 'copy', 'move']

export type OrganizeStatus = 'pending' | 'done' | 'failed' | 'skipped'

export const ORGANIZE_STATUS_VALUES: readonly OrganizeStatus[] = ['pending', 'done', 'failed', 'skipped']

// Subtitles and sidecar metadata imported next to the video when
// "Import extra files" is enabled (Radarr calls this "Import Extra Files").
export const DEFAULT_EXTRA_FILE_EXTENSIONS: readonly string[] = ['srt', 'sub', 'ass', 'ssa', 'vtt', 'nfo']

export const MAX_EXTRA_FILE_EXTENSIONS = 20

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
  episodeEnd?: number | null
  airDate: string | null
  resolution: string | null
  source: string | null
  extension: string
}

export interface OrganizeResult {
  status: OrganizeStatus
  targetRelativePath: string | null
  error: string | null
  importedFiles: number
  skippedFiles: number
  extrasImported: number
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
  importExtraFiles: boolean
  extraFileExtensions: string[]
}

export interface MediaStagingStatus {
  movies: boolean
  series: boolean
}

export interface MediaConfigUpdate {
  enabled?: boolean
  importMode?: string
  importExtraFiles?: boolean
  extraFileExtensions?: string
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
