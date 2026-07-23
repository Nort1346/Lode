export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<{ ip: string }>(event)
  if (!body.ip) {
    throw createError({ statusCode: 400, statusMessage: 'IP is required' })
  }
  await unblockIp(body.ip)
  await logActivity(event, {
    action: 'brute_force_unblock_ip',
    userId: admin.id,
    username: admin.username,
    details: `Unblocked IP: ${body.ip}`
  })
  return { success: true }
})
