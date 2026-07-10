import { describe, it, expect, vi } from 'vitest'
import { markInLibrary } from '#server/utils/browse-utils'
import type { SyncProvider } from '#server/utils/sync/types'

describe('markInLibrary', () => {
  it('marks all items as not in library when no provider given', async () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const result = await markInLibrary(items)
    expect(result).toHaveLength(3)
    result.forEach((item) => {
      expect(item.inLibrary).toBe(false)
    })
  })

  it('returns items with inLibrary=false for empty array', async () => {
    const result = await markInLibrary([])
    expect(result).toEqual([])
  })

  it('uses provider to check each item', async () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const provider: SyncProvider = {
      isItemInLibrary: vi.fn(async (id: number) => id % 2 === 0)
    } as Partial<SyncProvider> as SyncProvider

    const result = await markInLibrary(items, provider)

    expect(provider.isItemInLibrary).toHaveBeenCalledTimes(3)
    expect(provider.isItemInLibrary).toHaveBeenCalledWith(1)
    expect(provider.isItemInLibrary).toHaveBeenCalledWith(2)
    expect(result.find((i) => i.id === 1)?.inLibrary).toBe(false)
    expect(result.find((i) => i.id === 2)?.inLibrary).toBe(true)
    expect(result.find((i) => i.id === 3)?.inLibrary).toBe(false)
  })

  it('preserves original item properties', async () => {
    const items = [{ id: 1, title: 'Movie A', year: 2024 }]
    const provider: SyncProvider = {
      isItemInLibrary: vi.fn(async () => true)
    } as Partial<SyncProvider> as SyncProvider

    const result = await markInLibrary(items, provider)
    expect(result[0]).toMatchObject({ id: 1, title: 'Movie A', year: 2024, inLibrary: true })
  })
})
