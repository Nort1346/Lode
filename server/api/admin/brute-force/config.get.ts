export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { config: await getBruteForceConfig() }
})
