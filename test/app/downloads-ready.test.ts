import { describe, it, expect } from 'vitest'
import { markDownloadReady } from '~/utils/downloads-ready'
import type { Download } from '~/types/downloads'

const READY_AT = '2026-01-01T00:01:00.000Z'

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
    completedAt: '2026-01-01T00:00:10.000Z',
    notifiedAt: null,
    posterUrl: null,
    indexerName: null,
    resolution: null,
    organizeStatus: 'done',
    organizeError: null,
    organizeProgress: {
      percent: 60,
      copiedBytes: 600,
      totalBytes: 1000,
      speedBytesPerSecond: 10,
      filesDone: 1,
      filesTotal: 2
    },
    ...overrides
  }
}

const ready = {
  type: 'download_complete',
  data: { downloadId: 'dl-1' },
  createdAt: READY_AT
}

describe('markDownloadReady', () => {
  it('flips the matching row and clears the live import progress', () => {
    const rows = [makeDownload()]

    expect(markDownloadReady(rows, ready)).toBe(true)
    expect(rows[0]!.notifiedAt).toBe(READY_AT)
    expect(rows[0]!.organizeProgress).toBeNull()
  })

  it('ignores other notification types', () => {
    const rows = [makeDownload()]

    expect(markDownloadReady(rows, { ...ready, type: 'request_accepted' })).toBe(false)
    expect(rows[0]!.notifiedAt).toBeNull()
    expect(rows[0]!.organizeProgress).not.toBeNull()
  })

  it('ignores notifications without a download id', () => {
    const rows = [makeDownload()]

    expect(markDownloadReady(rows, { ...ready, data: null })).toBe(false)
    expect(markDownloadReady(rows, { ...ready, data: { requestId: 'r1' } })).toBe(false)
    expect(rows[0]!.notifiedAt).toBeNull()
  })

  it('leaves an already notified row alone', () => {
    const notifiedAt = '2026-01-01T00:00:30.000Z'
    const rows = [makeDownload({ notifiedAt })]

    expect(markDownloadReady(rows, ready)).toBe(false)
    expect(rows[0]!.notifiedAt).toBe(notifiedAt)
  })

  it('ignores downloads that are not on the current page', () => {
    const rows = [makeDownload({ id: 'dl-other' })]

    expect(markDownloadReady(rows, ready)).toBe(false)
    expect(rows[0]!.notifiedAt).toBeNull()
  })
})
