export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const session = await getUserSession(event)
  return { settings: { user: session.user } }
})
