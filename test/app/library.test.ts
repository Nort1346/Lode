import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '#shared/library'
import {
  defaultLibraryDirection,
  filterLibraryItems,
  matchesLibraryQuery,
  normalizeLibraryText,
  sortLibraryItems
} from '~/utils/library'

function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'item-1',
    type: 'movie',
    title: 'Arrival',
    originalTitle: null,
    year: 2016,
    overview: '',
    rating: 7.6,
    officialRating: null,
    runtimeMinutes: 116,
    episodeCount: null,
    seasonCount: null,
    genres: [],
    posterUrl: null,
    backdropUrl: null,
    addedAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  }
}

const items: LibraryItem[] = [
  item({ id: 'm1', title: 'Amélie', year: 2001, genres: ['Romance'] }),
  item({ id: 'm2', title: 'Arrival', year: 2016, genres: ['Sci-Fi', 'Drama'] }),
  item({ id: 's1', type: 'series', title: 'Dark', year: 2017, genres: ['Mystery'], episodeCount: 26 }),
  item({ id: 's2', type: 'series', title: 'Severance', year: 2022, genres: ['Drama'], episodeCount: 19 })
]

describe('normalizeLibraryText', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizeLibraryText('  Amélie  ')).toBe('  amelie  ')
  })
})

describe('matchesLibraryQuery', () => {
  it('matches an empty query', () => {
    expect(matchesLibraryQuery(items[0] as LibraryItem, '   ')).toBe(true)
  })

  it('matches titles without diacritics', () => {
    expect(matchesLibraryQuery(items[0] as LibraryItem, 'amelie')).toBe(true)
  })

  it('matches every term across title, genre and year', () => {
    expect(matchesLibraryQuery(items[1] as LibraryItem, 'arrival sci 2016')).toBe(true)
    expect(matchesLibraryQuery(items[1] as LibraryItem, 'arrival horror')).toBe(false)
  })

  it('matches original titles', () => {
    const movie = item({ title: 'The Intouchables', originalTitle: 'Intouchables' })
    expect(matchesLibraryQuery(movie, 'intouchables')).toBe(true)
  })
})

describe('filterLibraryItems', () => {
  it('filters by media type', () => {
    expect(filterLibraryItems(items, 'movie', '').map((entry) => entry.id)).toEqual(['m1', 'm2'])
    expect(filterLibraryItems(items, 'series', '').map((entry) => entry.id)).toEqual(['s1', 's2'])
  })

  it('combines the type filter with the search query', () => {
    expect(filterLibraryItems(items, 'series', 'drama').map((entry) => entry.id)).toEqual(['s2'])
  })
})

describe('sortLibraryItems', () => {
  it('sorts titles with the locale collator', () => {
    const sorted = sortLibraryItems(items, 'title', 'asc', 'en')
    expect(sorted.map((entry) => entry.title)).toEqual(['Amélie', 'Arrival', 'Dark', 'Severance'])
  })

  it('sorts titles descending', () => {
    const sorted = sortLibraryItems(items, 'title', 'desc', 'en')
    expect(sorted.map((entry) => entry.title)).toEqual(['Severance', 'Dark', 'Arrival', 'Amélie'])
  })

  it('sorts recently added items first', () => {
    const sorted = sortLibraryItems(
      [
        item({ id: 'old', title: 'Old', addedAt: '2020-01-01T00:00:00.000Z' }),
        item({ id: 'new', title: 'New', addedAt: '2025-01-01T00:00:00.000Z' })
      ],
      'added',
      'desc',
      'en'
    )
    expect(sorted.map((entry) => entry.id)).toEqual(['new', 'old'])
  })

  it('keeps unknown values last in both directions', () => {
    const sortedAsc = sortLibraryItems(
      [item({ id: 'known', title: 'Known', year: 2020 }), item({ id: 'unknown', title: 'Unknown', year: null })],
      'year',
      'asc',
      'en'
    )
    const sortedDesc = sortLibraryItems(
      [item({ id: 'unknown', title: 'Unknown', year: null }), item({ id: 'known', title: 'Known', year: 2020 })],
      'year',
      'desc',
      'en'
    )

    expect(sortedAsc.map((entry) => entry.id)).toEqual(['known', 'unknown'])
    expect(sortedDesc.map((entry) => entry.id)).toEqual(['known', 'unknown'])
  })

  it('does not mutate the input array', () => {
    const original = [...items]
    sortLibraryItems(items, 'rating', 'asc', 'en')
    expect(items).toEqual(original)
  })
})

describe('defaultLibraryDirection', () => {
  it('uses ascending for titles and descending for dates and numbers', () => {
    expect(defaultLibraryDirection('title')).toBe('asc')
    expect(defaultLibraryDirection('added')).toBe('desc')
    expect(defaultLibraryDirection('year')).toBe('desc')
  })
})
