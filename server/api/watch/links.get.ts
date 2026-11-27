import type { WatchLinksPayload } from '#shared/watch'
import { buildWatchTargets } from '#shared/watch'
import { useJellyfin } from '#server/utils/clients/jellyfin'

export default defineEventHandler(async (event): Promise<WatchLinksPayload> => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const query = getQuery(event)
  const tmdbId = Number(query.tmdbId)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid tmdbId' })
  }

  const client = useJellyfin()
  if (!client) {
    return { available: false, targets: [] }
  }

  const itemId = await client.getItemIdByTmdbId(tmdbId)
  if (itemId === null) {
    return { available: false, targets: [] }
  }

  const config = useRuntimeConfig()
  const [serverId, user] = await Promise.all([
    client.getServerId().catch(() => null),
    client.getUserByName(session.user.username).catch(() => null)
  ])
  const externalUrl = (config.jellyfinExternalUrl as string) || (config.jellyfinUrl as string)

  const targets = buildWatchTargets({
    jellyfin: {
      itemId,
      serverId: serverId ?? undefined,
      userId: user?.Id ?? undefined,
      externalUrl
    }
  })

  return { available: targets.length > 0, targets }
})
