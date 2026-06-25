import { putSetting } from '#server/utils/settings'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ enabled: boolean }>(event)

  putSetting('discord_mentions_enabled', body.enabled ? 'true' : 'false')

  logActivity(event, {
    action: 'discord_mentions_update',
    userId: admin.id,
    username: admin.username,
    details: JSON.stringify({ enabled: body.enabled })
  })

  return { enabled: body.enabled }
})
