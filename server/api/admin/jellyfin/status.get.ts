import { checkJellyfinStatus } from '#server/utils/clients/jellyfin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return checkJellyfinStatus()
})
