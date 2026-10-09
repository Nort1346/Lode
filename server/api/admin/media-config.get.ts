import { getMediaConfig } from '#server/utils/library/media-settings'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const config = await getMediaConfig()

  return {
    enabled: config.enabled,
    importMode: config.importMode
  }
})
