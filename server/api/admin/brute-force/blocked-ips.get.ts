export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { blockedIps: await getBlockedIps() }
})
