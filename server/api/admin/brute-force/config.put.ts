export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<Partial<BruteForceConfig>>(event)
  await saveBruteForceConfig(body)
  logActivity(event, {
    action: 'brute_force_config_update',
    userId: admin.id,
    username: admin.username,
    details: 'Updated brute force config'
  })
  return { success: true, config: await getBruteForceConfig() }
})
