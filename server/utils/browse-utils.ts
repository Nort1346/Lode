export async function markInLibrary<T extends { id: number }>(items: T[]): Promise<(T & { inLibrary: boolean })[]> {
  const providers = await getActiveSyncProviders()
  const provider = providers.find((p) => typeof p.isItemInLibrary === 'function')

  if (provider === undefined) {
    return items.map((i) => ({ ...i, inLibrary: false }))
  }

  return Promise.all(
    items.map(async (item) => ({
      ...item,
      inLibrary: (await provider.isItemInLibrary?.(item.id)) === true
    }))
  )
}
