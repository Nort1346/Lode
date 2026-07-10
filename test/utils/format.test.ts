import { describe, it, expect } from 'vitest'
import { formatSize } from '#server/utils/format'

describe('formatSize', () => {
  it('returns 0 B for 0 bytes', () => {
    expect(formatSize(0)).toBe('0 B')
  })

  it('formats bytes correctly', () => {
    expect(formatSize(1)).toBe('1.0 B')
    expect(formatSize(1023)).toBe('1023.0 B')
    expect(formatSize(1024)).toBe('1.0 KB')
    expect(formatSize(1536)).toBe('1.5 KB')
  })

  it('formats KB correctly', () => {
    expect(formatSize(1024)).toBe('1.0 KB')
    expect(formatSize(1024 * 1023)).toBe('1023.0 KB')
    expect(formatSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatSize(1024 * 1024 * 1.5)).toBe('1.5 MB')
  })

  it('formats MB correctly', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatSize(1024 * 1024 * 1023)).toBe('1023.0 MB')
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.0 GB')
    expect(formatSize(1024 * 1024 * 1024 * 1.5)).toBe('1.5 GB')
  })

  it('formats GB correctly', () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.0 GB')
    expect(formatSize(1024 * 1024 * 1024 * 1023)).toBe('1023.0 GB')
    expect(formatSize(1024 * 1024 * 1024 * 1024)).toBe('1.0 TB')
    expect(formatSize(1024 * 1024 * 1024 * 1024 * 1.5)).toBe('1.5 TB')
  })

  it('formats TB correctly', () => {
    expect(formatSize(1024 * 1024 * 1024 * 1024)).toBe('1.0 TB')
    expect(formatSize(1024 * 1024 * 1024 * 1024 * 1023)).toBe('1023.0 TB')
  })

  it('handles exact boundary values', () => {
    expect(formatSize(1024 ** 1)).toBe('1.0 KB')
    expect(formatSize(1024 ** 2)).toBe('1.0 MB')
    expect(formatSize(1024 ** 3)).toBe('1.0 GB')
    expect(formatSize(1024 ** 4)).toBe('1.0 TB')
  })
})
