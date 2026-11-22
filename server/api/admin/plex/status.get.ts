import { checkPlexStatus } from '#server/utils/clients/plex'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return checkPlexStatus()
})
