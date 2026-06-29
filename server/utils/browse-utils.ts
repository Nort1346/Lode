import type { SyncProvider } from './sync/types'

export async function markInLibrary<T extends { id: number }>(
  items: T[],
  provider?: SyncProvider
): Promise<(T & { inLibrary: boolean })[]> {
  if (!provider) {
    return items.map((i) => ({ ...i, inLibrary: false }))
  }

  return Promise.all(
    items.map(async (item) => ({
      ...item,
      inLibrary: (await provider.isItemInLibrary?.(item.id)) === true
    }))
  )
}
