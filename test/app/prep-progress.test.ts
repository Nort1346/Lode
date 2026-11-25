import { describe, it, expect } from 'vitest'
import { computeImportPercent, computeWaitPercent } from '~/utils/prep-progress'
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
    prepStartedAt: null,
    posterUrl: null,
    indexerName: null,
    resolution: null,
    // 'skipped' = no import to wait for (organization off or a non-media
    // category), so the import bar is already full.
    organizeStatus: 'skipped',
    organizeError: null,
    ...overrides
  }
}

function makeProgress(percent: number) {
  return {
    percent,
    copiedBytes: Math.round((percent / 100) * 1000),
    totalBytes: 1000,
    speedBytesPerSecond: 10,
    filesDone: 1,
    filesTotal: 2
  }
}

describe('computeImportPercent', () => {
  it('reports 0 for a pending import without a live entry', () => {
    // Right after a restart: the bytes are not in the library yet and the
    // retry sweep has not run.
    const download = makeDownload({ organizeStatus: 'pending', organizeProgress: null })
    expect(computeImportPercent(download)).toBe(0)
  })

  it('follows the live copy while an import is in flight', () => {
    const download = makeDownload({ organizeStatus: 'pending', organizeProgress: makeProgress(40) })
    expect(computeImportPercent(download)).toBe(40)
  })

  it('counts settled imports as done', () => {
    expect(computeImportPercent(makeDownload({ organizeStatus: 'done' }))).toBe(100)
    expect(computeImportPercent(makeDownload({ organizeStatus: 'skipped' }))).toBe(100)
    expect(computeImportPercent(makeDownload({ organizeStatus: 'failed' }))).toBe(100)
  })
})

describe('computeWaitPercent', () => {
  it('returns 0 without a start timestamp', () => {
    expect(computeWaitPercent(makeDownload({ completedAt: null }), 100, true, COMPLETED_AT)).toBe(0)
  })

  it('returns 100 when the countdown is disabled', () => {
    expect(computeWaitPercent(makeDownload(), 100, false, COMPLETED_AT)).toBe(100)
  })

  it('treats a zero delay as an instantly finished wait', () => {
    expect(computeWaitPercent(makeDownload(), 0, true, COMPLETED_AT)).toBe(100)
  })

  it('counts from the import settle time, not the download completion', () => {
    const download = makeDownload({
      prepStartedAt: new Date(COMPLETED_AT + 90_000).toISOString()
    })
    expect(computeWaitPercent(download, 100, true, COMPLETED_AT + 100_000)).toBe(10)
  })

  it('falls back to completedAt for older rows', () => {
    expect(computeWaitPercent(makeDownload(), 100, true, COMPLETED_AT + 50_000)).toBe(50)
  })

  it('rounds to one decimal place and caps at 100', () => {
    expect(computeWaitPercent(makeDownload(), 100, true, COMPLETED_AT + 33_333)).toBe(33.3)
    expect(computeWaitPercent(makeDownload(), 100, true, COMPLETED_AT + 500_000)).toBe(100)
  })

  it('never goes negative when the start is in the future', () => {
    const download = makeDownload({ prepStartedAt: new Date(COMPLETED_AT + 10_000).toISOString() })
    expect(computeWaitPercent(download, 100, true, COMPLETED_AT)).toBe(0)
  })
})
