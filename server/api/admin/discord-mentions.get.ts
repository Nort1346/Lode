import { isDiscordMentionsEnabled } from '#server/utils/notifications/discord'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { enabled: await isDiscordMentionsEnabled() }
})
