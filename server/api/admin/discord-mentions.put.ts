import { putSetting } from '#server/utils/settings'
import { SETTINGS } from '#server/types/settings'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ enabled: boolean }>(event)

  await putSetting(SETTINGS.DISCORD_MENTIONS_ENABLED, body.enabled ? 'true' : 'false')

  logActivity(event, {
    action: 'discord_mentions_update',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify({ enabled: body.enabled })
  })

  return { enabled: body.enabled }
})
