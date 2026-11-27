import type { WatchLinksPayload, WatchSource } from '#shared/watch'
import { buildWatchTargets } from '#shared/watch'
import type { SyncProvider } from '#server/utils/sync/types'
import { getActiveSyncProviders } from '#server/utils/sync'

type WatchProvider = SyncProvider & { getWatchSource: NonNullable<SyncProvider['getWatchSource']> }

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

  const username = session.user.username
  const providers = await getActiveSyncProviders()
  const watchProviders = providers.filter(
    (provider): provider is WatchProvider => typeof provider.getWatchSource === 'function'
  )
  const sources = await Promise.all(
    watchProviders.map((provider) => provider.getWatchSource(tmdbId, username).catch(() => null))
  )

  const source: WatchSource = {}
  for (const result of sources) {
    if (result !== null) Object.assign(source, result)
  }

  const targets = buildWatchTargets(source)
  return { available: targets.length > 0, targets }
})
