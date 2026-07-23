export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  await resetRankingConfig()
  await logActivity(event, {
    action: 'ranking_config_reset',
    userId: admin.id,
    username: admin.username,
    details: 'Reset torrent ranking config to defaults'
  })
  return { success: true, config: await getRankingConfig() }
})
