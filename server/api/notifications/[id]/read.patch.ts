export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (id === null || id === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Missing notification ID' })
  }

  const updated = await markAsRead(id, session.user.id)
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Notification not found' })
  }

  return { success: true }
})
