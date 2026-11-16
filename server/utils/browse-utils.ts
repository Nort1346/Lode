import type { SyncProvider } from './sync/types'

// Picks up to `max` alternative titles to use as extra search-query tiers.
// Scene releases are almost always named in English, so English alt titles are
// moved to the front when the user's media language is not English; for an
// English media language the TMDB ordering is kept (localized alts may match
// localized releases the English title cannot).
export function pickAlternativeTitles(
  alternatives: Array<{ title: string; iso_639_1: string | null }>,
  excluded: string[],
  locale: string,
  max = 2
): string[] {
  const excludedSet = new Set(excluded.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0))
  const seen = new Set<string>()
  const candidates: Array<{ title: string; isEnglish: boolean }> = []

  for (const alt of alternatives) {
    const title = alt.title.trim()
    const key = title.toLowerCase()
    if (title.length === 0 || seen.has(key) || excludedSet.has(key)) continue
    seen.add(key)
    candidates.push({ title, isEnglish: alt.iso_639_1 === 'en' })
  }

  if (locale !== 'en') {
    candidates.sort((a, b) => Number(b.isEnglish) - Number(a.isEnglish))
  }

  return candidates.slice(0, max).map((c) => c.title)
}

// Marks each item with `inLibrary` if it exists in ANY of the given providers'
// libraries (OR semantics - D7). With two media servers connected, an item that
// lives in either one counts as in-library. A provider that throws is treated as
// `false` for that item so a single failing server never fails the browse request.
// Only providers implementing `isItemInLibrary` are consulted; pass
// `providers.filter((p) => typeof p.isItemInLibrary === 'function')`.
export async function markInLibrary<T extends { id: number }>(
  items: T[],
  providers: SyncProvider[] = []
): Promise<(T & { inLibrary: boolean })[]> {
  const checkers = providers.filter((p) => typeof p.isItemInLibrary === 'function')
  if (checkers.length === 0) {
    return items.map((i) => ({ ...i, inLibrary: false }))
  }

  return Promise.all(
    items.map(async (item) => {
      const results = await Promise.all(
        checkers.map(async (provider) => {
          try {
            return (await provider.isItemInLibrary?.(item.id)) === true
          } catch {
            return false
          }
        })
      )
      return { ...item, inLibrary: results.some((r) => r) }
    })
  )
}
