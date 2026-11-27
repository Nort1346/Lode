import type { LibraryItem, LibraryResponse } from '#shared/library'
import { emptyLibraryStats } from '#shared/library'
import { useJellyfin } from '#server/utils/clients/jellyfin'
import { mapMediaLibraryItem, summarizeLibrary } from '#server/utils/media-library'
import { createLogger } from '#server/utils/logger'

const log = createLogger('Library')

export default defineEventHandler(async (event): Promise<LibraryResponse> => {
  await requireUser(event)

  const client = useJellyfin()
  if (client === null) {
    return {
      configured: false,
      connected: false,
      fetchedAt: new Date().toISOString(),
      items: [],
      stats: emptyLibraryStats()
    }
  }

  const force = getQuery(event).force === '1'

  try {
    const rawItems = await client.getLibraryItems(force)
    const items = rawItems.map((item) => mapMediaLibraryItem(item)).filter((item): item is LibraryItem => item !== null)

    return {
      configured: true,
      connected: true,
      fetchedAt: new Date().toISOString(),
      items,
      stats: summarizeLibrary(items)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn(`library fetch failed: ${message}`)
    return {
      configured: true,
      connected: false,
      fetchedAt: new Date().toISOString(),
      items: [],
      stats: emptyLibraryStats()
    }
  }
})
