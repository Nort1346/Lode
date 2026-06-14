export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  logActivity(event, {
    action: 'logout',
    userId: session.user?.id,
    username: session.user?.username
  })
  await clearUserSession(event)
  return { success: true }
})
