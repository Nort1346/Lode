import type { RankingConfig } from '#server/types/ranking'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<RankingConfig>(event)
  await saveRankingConfig(body)
  await logActivity(event, {
    action: 'ranking_config_update',
    userId: admin.id,
    username: admin.username,
    details: 'Updated torrent ranking config'
  })
  return { success: true, config: await getRankingConfig() }
})
