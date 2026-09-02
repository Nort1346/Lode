import { describe, it, expect } from 'vitest'
import {
  UNRELIABLE_ETA_SECONDS,
  formatDateTime,
  formatEta,
  getEtaState,
  getTorrentQuality
} from '../../app/composables/useTorrentUtils'

describe('formatEta', () => {
  it('returns a dash for non-positive seconds', () => {
    expect(formatEta(0)).toBe('--')
    expect(formatEta(-5)).toBe('--')
  })

  it('formats seconds only under a minute', () => {
    expect(formatEta(45)).toBe('45s')
  })

  it('formats minutes and seconds under an hour', () => {
    expect(formatEta(1261)).toBe('21m 1s')
  })

  it('formats hours and minutes', () => {
    expect(formatEta(3661)).toBe('1h 1m')
  })
})

describe('formatDateTime', () => {
  it('returns a dash for an empty string', () => {
    expect(formatDateTime('')).toBe('-')
  })

  it('returns a dash for an invalid date', () => {
    expect(formatDateTime('not-a-date')).toBe('-')
  })

  it('includes the localized date and time for a valid date', () => {
    const input = '2026-09-02T12:00:00.000Z'
    const d = new Date(input)
    const result = formatDateTime(input, 'en-US')
    expect(result).toContain(d.toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }))
    expect(result).toContain(d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))
  })
})

describe('getEtaState', () => {
  const base = { etaSeconds: 120, numSeeds: 5, downloadSpeed: 500_000, progress: 10 }

  it('is calculating for a fresh torrent with no seeders and no progress', () => {
    expect(getEtaState({ etaSeconds: 0, numSeeds: 0, downloadSpeed: 0, progress: 0 })).toBe('calculating')
  })

  it('is waiting-seeders once the download has started with no seeders', () => {
    expect(getEtaState({ ...base, numSeeds: 0, downloadSpeed: 0 })).toBe('waiting-seeders')
  })

  it('is calculating when the eta is unknown', () => {
    expect(getEtaState({ ...base, etaSeconds: 0 })).toBe('calculating')
  })

  it('is calculating when the speed is zero', () => {
    expect(getEtaState({ ...base, downloadSpeed: 0 })).toBe('calculating')
  })

  it('is calculating for an unreliable eta', () => {
    expect(getEtaState({ ...base, etaSeconds: UNRELIABLE_ETA_SECONDS + 1 })).toBe('calculating')
  })

  it('is ready when the eta and speed are known', () => {
    expect(getEtaState(base)).toBe('ready')
  })
})

describe('getTorrentQuality', () => {
  it('is ok for a fresh torrent before its first announce', () => {
    expect(getTorrentQuality({ numSeeds: 0, downloadSpeed: 0, progress: 0 })).toBe('ok')
  })

  it('is dead once the download has started with zero seeders', () => {
    expect(getTorrentQuality({ numSeeds: 0, downloadSpeed: 0, progress: 30 })).toBe('dead')
  })

  it('is ok when downloading with seeders', () => {
    expect(getTorrentQuality({ numSeeds: 10, downloadSpeed: 500_000, progress: 50 })).toBe('ok')
  })

  it('is slow when downloading without seeders', () => {
    expect(getTorrentQuality({ numSeeds: 0, downloadSpeed: 100_000, progress: 50 })).toBe('slow')
  })

  it('is poor with fewer than 5 idle seeders', () => {
    expect(getTorrentQuality({ numSeeds: 3, downloadSpeed: 0, progress: 0 })).toBe('poor')
  })

  it('is slow with fewer than 20 idle seeders', () => {
    expect(getTorrentQuality({ numSeeds: 10, downloadSpeed: 0, progress: 0 })).toBe('slow')
  })

  it('is ok with 20 or more idle seeders', () => {
    expect(getTorrentQuality({ numSeeds: 25, downloadSpeed: 0, progress: 0 })).toBe('ok')
  })
})
