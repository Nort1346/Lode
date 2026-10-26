import { describe, it, expect, vi } from 'vitest'
import { markInLibrary } from '#server/utils/browse-utils'
import type { SyncProvider } from '#server/utils/sync/types'

function provider(isItemInLibrary: (id: number) => Promise<boolean>): SyncProvider {
  return { isItemInLibrary } as Partial<SyncProvider> as SyncProvider
}

describe('markInLibrary', () => {
  it('marks all items as not in library when no provider given', async () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const result = await markInLibrary(items)
    expect(result).toHaveLength(3)
    result.forEach((item) => {
      expect(item.inLibrary).toBe(false)
    })
  })

  it('marks all items as not in library for an empty provider list', async () => {
    const items = [{ id: 1 }, { id: 2 }]
    const result = await markInLibrary(items, [])
    result.forEach((item) => expect(item.inLibrary).toBe(false))
  })

  it('returns items with inLibrary=false for empty array', async () => {
    const result = await markInLibrary([])
    expect(result).toEqual([])
  })

  it('uses a single provider to check each item', async () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const spy = vi.fn(async (id: number) => id % 2 === 0)
    const p = provider(spy)

    const result = await markInLibrary(items, [p])

    expect(spy).toHaveBeenCalledTimes(3)
    expect(spy).toHaveBeenCalledWith(1)
    expect(spy).toHaveBeenCalledWith(2)
    expect(result.find((i) => i.id === 1)?.inLibrary).toBe(false)
    expect(result.find((i) => i.id === 2)?.inLibrary).toBe(true)
    expect(result.find((i) => i.id === 3)?.inLibrary).toBe(false)
  })

  it('preserves original item properties', async () => {
    const items = [{ id: 1, title: 'Movie A', year: 2024 }]
    const p = provider(async () => true)

    const result = await markInLibrary(items, [p])
    expect(result[0]).toMatchObject({ id: 1, title: 'Movie A', year: 2024, inLibrary: true })
  })

  it('ORs two providers that disagree (in-library in any server counts)', async () => {
    const items = [{ id: 1 }, { id: 2 }]
    // server A has item 1 only; server B has item 2 only
    const serverA = provider(async (id) => id === 1)
    const serverB = provider(async (id) => id === 2)

    const result = await markInLibrary(items, [serverA, serverB])

    expect(result.find((i) => i.id === 1)?.inLibrary).toBe(true)
    expect(result.find((i) => i.id === 2)?.inLibrary).toBe(true)
  })

  it('does not mark an item that exists in neither of two providers', async () => {
    const items = [{ id: 1 }]
    const serverA = provider(async () => false)
    const serverB = provider(async () => false)

    const result = await markInLibrary(items, [serverA, serverB])

    expect(result.find((i) => i.id === 1)?.inLibrary).toBe(false)
  })

  it('treats a throwing provider as false but still consults the other (never fails)', async () => {
    const items = [{ id: 1 }, { id: 2 }]
    const broken = provider(async () => {
      throw new Error('plex down')
    })
    const healthy = provider(async (id) => id === 2)

    // The whole browse request must resolve even though `broken` throws.
    const result = await markInLibrary(items, [broken, healthy])

    // item 1: broken throws (false), healthy says false -> false
    expect(result.find((i) => i.id === 1)?.inLibrary).toBe(false)
    // item 2: broken throws (false), healthy says true -> OR still true
    expect(result.find((i) => i.id === 2)?.inLibrary).toBe(true)
  })

  it('fails open to false when every provider throws', async () => {
    const items = [{ id: 1 }]
    const a = provider(async () => {
      throw new Error('a')
    })
    const b = provider(async () => {
      throw new Error('b')
    })

    const result = await markInLibrary(items, [a, b])

    expect(result.find((i) => i.id === 1)?.inLibrary).toBe(false)
  })

  it('skips providers that do not implement isItemInLibrary', async () => {
    const items = [{ id: 1 }]
    const withMethod = provider(async () => true)
    const withoutMethod = { name: 'nolibrary' } as Partial<SyncProvider> as SyncProvider

    const result = await markInLibrary(items, [withoutMethod, withMethod])

    expect(result.find((i) => i.id === 1)?.inLibrary).toBe(true)
  })
})
