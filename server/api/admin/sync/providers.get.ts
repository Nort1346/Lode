import { getActiveSyncProviders } from '#server/utils/sync'
import { useJellyfin } from '#server/utils/clients/jellyfin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const providers = await getActiveSyncProviders()

  return {
    providers: providers.map((p) => ({ name: p.name, enabled: true })),
    // "Configured" means the connection is set (URL + API key), independent of
    // whether Jellyfin sync is currently enabled.
    jellyfinConfigured: useJellyfin() !== null
  }
})
