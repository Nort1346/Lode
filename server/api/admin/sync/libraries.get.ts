import { getActiveSyncProviders } from '#server/utils/sync'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const providers = await getActiveSyncProviders()
  const results: Array<{
    name: string
    enabled: boolean
    libraries: Array<{ id: string; name: string; path: string }>
  }> = []

  for (const provider of providers) {
    try {
      const libraries = await provider.getLibraries()
      results.push({ name: provider.name, enabled: true, libraries })
    } catch {
      results.push({ name: provider.name, enabled: true, libraries: [] })
    }
  }

  return results
})
