import type { LibraryItem, LibraryMediaType, LibrarySortDirection, LibrarySortKey } from '#shared/library'

export function normalizeLibraryText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
}

export function matchesLibraryQuery(item: LibraryItem, query: string): boolean {
  const terms = normalizeLibraryText(query).trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true

  const haystack = normalizeLibraryText(
    [item.title, item.originalTitle ?? '', item.year === null ? '' : String(item.year), ...item.genres].join(' ')
  )
  return terms.every((term) => haystack.includes(term))
}

export function filterLibraryItems(items: LibraryItem[], type: LibraryMediaType, query: string): LibraryItem[] {
  return items.filter((item) => item.type === type && matchesLibraryQuery(item, query))
}

function timestamp(value: string | null): number | null {
  if (value === null) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function compareNullable(a: number | null, b: number | null, factor: number): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return (a - b) * factor
}

export function sortLibraryItems(
  items: LibraryItem[],
  sort: LibrarySortKey,
  direction: LibrarySortDirection,
  locale: string
): LibraryItem[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  const factor = direction === 'asc' ? 1 : -1

  return [...items].sort((a, b) => {
    let result = 0
    switch (sort) {
      case 'title':
        result = collator.compare(a.title, b.title) * factor
        break
      case 'added':
        result = compareNullable(timestamp(a.addedAt), timestamp(b.addedAt), factor)
        break
      case 'year':
        result = compareNullable(a.year, b.year, factor)
        break
      case 'rating':
        result = compareNullable(a.rating, b.rating, factor)
        break
      case 'runtime':
        result = compareNullable(a.runtimeMinutes, b.runtimeMinutes, factor)
        break
    }
    if (result === 0) return collator.compare(a.title, b.title)
    return result
  })
}

export function defaultLibraryDirection(sort: LibrarySortKey): LibrarySortDirection {
  return sort === 'title' ? 'asc' : 'desc'
}
