import { getActiveSyncProviders } from '#server/utils/sync'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const providers = await getActiveSyncProviders()

  return {
    providers: providers.map((p) => ({ name: p.name, enabled: true })),
    jellyfinConfigured: providers.some((p) => p.name === 'jellyfin')
  }
})
