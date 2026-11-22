import { describe, it, expect } from 'vitest'
import { seasonPackDownloadLabel, seasonRangeLabel } from '~/utils/season-label'

describe('season-label', () => {
  it('formats contiguous, single and non-contiguous season sets', () => {
    expect(seasonRangeLabel([])).toBe('')
    expect(seasonRangeLabel([2])).toBe('2')
    expect(seasonRangeLabel([1, 2])).toBe('1-2')
    expect(seasonRangeLabel([1, 2, 3])).toBe('1-3')
    expect(seasonRangeLabel([1, 3])).toBe('1, 3')
    expect(seasonRangeLabel([3, 1, 3])).toBe('1, 3')
  })

  it('never labels a non-contiguous pack as a range in the download label', () => {
    expect(seasonPackDownloadLabel('Severance', [1, 3], 1)).toBe('Severance S01+S03 Season Pack')
    expect(seasonPackDownloadLabel('Severance', [1, 2], 1)).toBe('Severance S01-S02 Season Pack')
    expect(seasonPackDownloadLabel('Severance', [], 1)).toBe('Severance S01 Season Pack')
    expect(seasonPackDownloadLabel('Severance', [2], 1)).toBe('Severance S02 Season Pack')
  })
})
