import { describe, it, expect } from 'vitest'
import { computePrepPercent } from '~/utils/prep-progress'
import type { Download } from '~/types/downloads'

const COMPLETED_AT = Date.UTC(2026, 0, 1)

function makeDownload(overrides: Partial<Download> = {}): Download {
  return {
    id: 'dl-1',
    userId: 'u1',
    label: 'Dune',
    torrentName: 'Dune.2021.1080p.WEB-DL',
    magnetLink: '',
    savePath: 'movies',
    status: 'completed',
    torrentHash: 'h',
    progress: 100,
    etaSeconds: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    sizeBytes: 1000,
    downloadedBytes: 1000,
    numSeeds: 0,
    numLeechs: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: new Date(COMPLETED_AT).toISOString(),
    notifiedAt: null,
    posterUrl: null,
    indexerName: null,
    resolution: null,
    organizeStatus: 'pending',
    organizeError: null,
    ...overrides
  }
}

// 1000 bytes at 10 B/s = a 100 s countdown.
const SPEED = 10

describe('computePrepPercent', () => {
  it('returns 0 without a completion timestamp', () => {
    expect(computePrepPercent(makeDownload({ completedAt: null }), SPEED, COMPLETED_AT)).toBe(0)
  })

  it('follows the simulated countdown', () => {
    const download = makeDownload()
    expect(computePrepPercent(download, SPEED, COMPLETED_AT + 50_000)).toBe(50)
  })

  it('rounds to one decimal place', () => {
    const download = makeDownload()
    expect(computePrepPercent(download, SPEED, COMPLETED_AT + 33_333)).toBe(33.3)
  })

  it('lets the real import progress win when it is further along', () => {
    const download = makeDownload({
      organizeProgress: {
        percent: 80,
        copiedBytes: 800,
        totalBytes: 1000,
        speedBytesPerSecond: 10,
        filesDone: 1,
        filesTotal: 2
      }
    })
    expect(computePrepPercent(download, SPEED, COMPLETED_AT + 10_000)).toBe(80)
  })

  it('stays at 100 once the import is done and the progress entry is gone', () => {
    // 60 s into a 100 s countdown: without the done check the bar would drop
    // from 100% back to 60% after the import finished.
    const download = makeDownload({ organizeStatus: 'done', organizeProgress: null })
    expect(computePrepPercent(download, SPEED, COMPLETED_AT + 60_000)).toBe(100)
  })

  it('treats a zero speed as an instantly finished countdown', () => {
    expect(computePrepPercent(makeDownload(), 0, COMPLETED_AT)).toBe(100)
  })
})
