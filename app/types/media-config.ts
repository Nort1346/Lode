export interface MediaStagingStatus {
  movies: boolean
  series: boolean
}

export interface MediaConfigResponse {
  enabled: boolean
  importMode: string
  importExtraFiles: boolean
  extraFileExtensions: string
  staging: MediaStagingStatus
}
