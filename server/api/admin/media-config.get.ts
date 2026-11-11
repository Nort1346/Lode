import { getMediaConfig } from '#server/utils/library/media-settings'
import type { MediaStagingStatus } from '#server/types/media-organize'

function hasPath(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const config = await getMediaConfig()
  const runtime = useRuntimeConfig()

  const staging: MediaStagingStatus = {
    movies: hasPath(runtime.downloadPathMovies),
    series: hasPath(runtime.downloadPathSeries)
  }

  return {
    enabled: config.enabled,
    importMode: config.importMode,
    importExtraFiles: config.importExtraFiles,
    extraFileExtensions: config.extraFileExtensions.join(', '),
    staging
  }
})
