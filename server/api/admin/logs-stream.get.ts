import { getLogBuffer, subscribeToLogs } from '#server/utils/logger'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  const nodeRes = event.node.res

  // Send existing logs as backfill
  const existing = getLogBuffer()
  for (const line of existing) {
    nodeRes.write(`data: ${JSON.stringify({ line })}\n\n`)
  }

  // Subscribe to new logs
  const unsubscribe = subscribeToLogs((line) => {
    nodeRes.write(`data: ${JSON.stringify({ line })}\n\n`)
  })

  // Cleanup on disconnect
  event.node.req.on('close', () => {
    unsubscribe()
  })
})
