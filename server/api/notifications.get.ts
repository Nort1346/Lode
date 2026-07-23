export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const notifications = await getUserNotifications(session.user.id)
  const unreadCount = await getUnreadCount(session.user.id)

  return { notifications, unreadCount }
})
