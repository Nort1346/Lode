import { describe, it, expect } from 'vitest'
import { normalizeEta, QBITTORRENT_UNKNOWN_ETA, UNRELIABLE_ETA_SECONDS } from '#server/utils/torrents/eta'

describe('normalizeEta', () => {
  it('returns 0 for non-finite values', () => {
    expect(normalizeEta(NaN)).toBe(0)
    expect(normalizeEta(Infinity)).toBe(0)
    expect(normalizeEta(-Infinity)).toBe(0)
  })

  it('returns 0 for zero and negative values', () => {
    expect(normalizeEta(0)).toBe(0)
    expect(normalizeEta(-5)).toBe(0)
  })

  it('returns 0 for the qBittorrent unknown sentinel', () => {
    expect(normalizeEta(QBITTORRENT_UNKNOWN_ETA)).toBe(0)
  })

  it('returns 0 for unreliable values over 48 hours', () => {
    expect(normalizeEta(UNRELIABLE_ETA_SECONDS + 1)).toBe(0)
  })

  it('keeps the 48h boundary value as reliable', () => {
    expect(normalizeEta(UNRELIABLE_ETA_SECONDS)).toBe(UNRELIABLE_ETA_SECONDS)
  })

  it('rounds valid fractional seconds', () => {
    expect(normalizeEta(3600.4)).toBe(3600)
    expect(normalizeEta(120)).toBe(120)
  })
})
