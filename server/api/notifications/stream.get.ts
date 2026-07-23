import { subscribeToNotifications } from '#server/utils/sse-hubs'
import { getUnreadCount } from '#server/utils/notifications'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  const nodeRes = event.node.res
  const userId = session.user.id

  const unreadCount = await getUnreadCount(userId)
  nodeRes.write(`data: ${JSON.stringify({ type: 'init', unreadCount })}\n\n`)

  const unsubscribe = subscribeToNotifications(userId, (data) => {
    nodeRes.write(data)
  })

  const heartbeat = setInterval(() => {
    nodeRes.write(':keepalive\n\n')
  }, 30_000)

  event.node.req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
})
