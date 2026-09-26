import type { H3Event } from 'h3'
import { checkCoreServices } from '#server/utils/health'

// User-facing health for the services a session depends on (TMDB metadata,
// Prowlarr search, qBittorrent downloads). Deliberately narrower than the
// admin system-status: no infrastructure details, no polling - the client
// caches results and only re-checks after a TTL or an explicit retry.
export default defineEventHandler(async (event: H3Event) => {
  await requireUser(event)

  const config = useRuntimeConfig()
  const services = await checkCoreServices(config)

  return { services }
})
