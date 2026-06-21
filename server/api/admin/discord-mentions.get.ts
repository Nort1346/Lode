import { isDiscordMentionsEnabled } from '#server/utils/discord'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { enabled: isDiscordMentionsEnabled() }
})
