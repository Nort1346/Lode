export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { stats: await getBruteForceStats() }
})
