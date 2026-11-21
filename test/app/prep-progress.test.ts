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
    // 'skipped' = no import to wait for (organization off or a non-media
    // category), so the bar is driven by the countdown alone.
    organizeStatus: 'skipped',
    organizeError: null,
    ...overrides
  }
}

// 1000 bytes at 10 B/s = a 100 s countdown.
const SPEED = 10

function makeProgress(percent: number) {
  return {
    percent,
    copiedBytes: Math.round((percent / 100) * 1000),
    totalBytes: 1000,
    speedBytesPerSecond: SPEED,
    filesDone: 1,
    filesTotal: 2
  }
}

describe('computePrepPercent', () => {
  it('returns 0 without a completion timestamp', () => {
    expect(computePrepPercent(makeDownload({ completedAt: null }), SPEED, true, COMPLETED_AT)).toBe(0)
  })

  it('follows the simulated countdown when no import is involved', () => {
    expect(computePrepPercent(makeDownload(), SPEED, true, COMPLETED_AT + 50_000)).toBe(50)
  })

  it('rounds to one decimal place', () => {
    expect(computePrepPercent(makeDownload(), SPEED, true, COMPLETED_AT + 33_333)).toBe(33.3)
  })

  it('follows the live copy while an import is in flight', () => {
    const download = makeDownload({ organizeStatus: 'pending', organizeProgress: makeProgress(40) })
    expect(computePrepPercent(download, SPEED, true, COMPLETED_AT + 90_000)).toBe(40)
  })

  it('caps a fast import by the countdown instead of jumping to 100', () => {
    // A hardlink import finishes in seconds: the files are already in the
    // library, but the notification still waits for the countdown, so the bar
    // waits with it instead of claiming 100% early.
    const download = makeDownload({ organizeStatus: 'done', organizeProgress: null })
    expect(computePrepPercent(download, SPEED, true, COMPLETED_AT + 60_000)).toBe(60)
  })

  it('reports 0 for a pending import without a live entry', () => {
    // Right after a restart: the bytes are not in the library yet and the
    // retry sweep has not run.
    const download = makeDownload({ organizeStatus: 'pending', organizeProgress: null })
    expect(computePrepPercent(download, SPEED, true, COMPLETED_AT + 60_000)).toBe(0)
  })

  it('follows the copy when the countdown is disabled', () => {
    const download = makeDownload({ organizeStatus: 'pending', organizeProgress: makeProgress(40) })
    expect(computePrepPercent(download, SPEED, false, COMPLETED_AT + 90_000)).toBe(40)
  })

  it('does not wait for a failed import, which the notification ignores', () => {
    const download = makeDownload({ organizeStatus: 'failed', organizeProgress: null })
    expect(computePrepPercent(download, SPEED, true, COMPLETED_AT + 60_000)).toBe(60)
  })

  it('reaches 100 exactly when both gates are open', () => {
    const download = makeDownload({ organizeStatus: 'done', organizeProgress: null })
    expect(computePrepPercent(download, SPEED, true, COMPLETED_AT + 100_000)).toBe(100)
  })

  it('treats a zero speed as an instantly finished countdown', () => {
    expect(computePrepPercent(makeDownload(), 0, true, COMPLETED_AT)).toBe(100)
  })
})
