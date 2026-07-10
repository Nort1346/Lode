import { describe, it, expect } from 'vitest'
import { fisherYatesShuffle } from '#server/utils/shuffle'

describe('fisherYatesShuffle', () => {
  it('returns array of same length', () => {
    const input = [1, 2, 3, 4, 5]
    const result = fisherYatesShuffle(input)
    expect(result).toHaveLength(input.length)
  })

  it('contains all original elements', () => {
    const input = [1, 2, 3, 4, 5]
    const result = fisherYatesShuffle(input)
    expect(result.sort()).toEqual(input.sort())
  })

  it('does not mutate the original array', () => {
    const input = [1, 2, 3, 4, 5]
    const copy = [...input]
    fisherYatesShuffle(input)
    expect(input).toEqual(copy)
  })

  it('handles empty array', () => {
    const result = fisherYatesShuffle([])
    expect(result).toEqual([])
  })

  it('handles single element', () => {
    const result = fisherYatesShuffle([42])
    expect(result).toEqual([42])
  })

  it('handles two elements', () => {
    const result = fisherYatesShuffle(['a', 'b'])
    expect(result).toHaveLength(2)
    expect(result.sort()).toEqual(['a', 'b'])
  })

  it('handles string arrays', () => {
    const input = ['apple', 'banana', 'cherry', 'date']
    const result = fisherYatesShuffle(input)
    expect(result).toHaveLength(input.length)
    expect(result.sort()).toEqual(input.sort())
  })

  it('handles object arrays without mutating', () => {
    const input = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const copy = input.map((o) => ({ ...o }))
    const result = fisherYatesShuffle(input)
    expect(result).toHaveLength(3)
    expect(input).toEqual(copy)
  })

  it('produces different orderings over multiple runs (probabilistic)', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const results = Array.from({ length: 10 }, () => fisherYatesShuffle(input).join(','))
    const unique = new Set(results)
    expect(unique.size).toBeGreaterThan(1)
  })
})
