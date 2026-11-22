import { getActiveSyncProviders } from '#server/utils/sync'
import { useJellyfin } from '#server/utils/clients/jellyfin'
import { usePlex } from '#server/utils/clients/plex'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const providers = await getActiveSyncProviders()

  return {
    providers: providers.map((p) => ({ name: p.name, enabled: true })),
    // "Configured" means the connection is set (URL + API key / token), independent
    // of whether sync for that provider is currently enabled.
    jellyfinConfigured: useJellyfin() !== null,
    plexConfigured: usePlex() !== null
  }
})
