import { describe, it, expect } from 'vitest'
import { episodePackLabelParts, seasonPackDownloadLabel, seasonRangeLabel } from '~/utils/season-label'

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

  it('builds localized episode-pack placeholders from the pack season range', () => {
    expect(episodePackLabelParts([3, 1, 2], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 7)).toEqual({
      from: 1,
      to: 3,
      episodeFrom: 1,
      episodeTo: 12
    })
    expect(episodePackLabelParts([], [], 4)).toEqual({ from: 4, to: 4, episodeFrom: 1, episodeTo: 1 })
  })
})
