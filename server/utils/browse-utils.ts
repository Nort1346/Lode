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
