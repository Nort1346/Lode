import { checkDailyLimit } from '#server/utils/limits'
import { searchMovieTorrents, toStreamEvent } from '#server/utils/torrents/torrent-search'
import { TORRENT_STREAM_KEEPALIVE_MS } from '#server/types/torrent-search'
import type { MovieTorrentsOutcome, TorrentStreamEvent } from '#server/types/torrent-search'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const id = Number(getRouterParam(event, 'id'))
  if (isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid movie ID' })
  }

  const locale = (getQuery(event).locale as string | undefined) ?? 'en'

  const limit = await checkDailyLimit(session.user.id)

  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  const nodeRes = event.node.res
  let closed = false

  function send(obj: TorrentStreamEvent) {
    if (!closed) nodeRes.write(`data: ${JSON.stringify(obj)}\n\n`)
  }

  const heartbeat = setInterval(() => {
    if (!closed) nodeRes.write(':keepalive\n\n')
  }, TORRENT_STREAM_KEEPALIVE_MS)

  // The search keeps running after a client disconnect: finished queries land
  // in the Prowlarr cache, so a reconnect or the next request is fast. Writes
  // to the closed response are just skipped.
  event.node.req.on('close', () => {
    closed = true
    clearInterval(heartbeat)
  })

  function finish() {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    nodeRes.end()
  }

  if (limit.reached) {
    send({
      type: 'error',
      code: 'limit',
      status: 429,
      data: { activeCount: limit.activeCount, todayCount: limit.todayCount, limit: limit.limit }
    })
    finish()
    return
  }

  let outcome: MovieTorrentsOutcome
  try {
    outcome = await searchMovieTorrents(id, locale, (e) => send(toStreamEvent(e)))
  } catch {
    send({ type: 'error', code: 'details', status: 502 })
    finish()
    return
  }

  if (outcome.kind === 'details-failed') {
    send({ type: 'error', code: 'details', status: 502 })
  } else {
    send({ type: 'done', found: outcome.found, data: outcome.payload })
  }
  finish()
})
