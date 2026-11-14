import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  completeImportFile,
  finishImportProgress,
  getImportProgress,
  reportImportBytes,
  resetImportProgress,
  startImportProgress
} from '#server/utils/library/import-progress'

beforeEach(() => {
  vi.useFakeTimers()
  resetImportProgress()
})

afterEach(() => {
  resetImportProgress()
  vi.useRealTimers()
})

describe('import progress', () => {
  it('returns null for a download that is not importing', () => {
    expect(getImportProgress('missing')).toBeNull()
  })

  it('reports the copied bytes and percent of a fresh import', () => {
    startImportProgress('dl-1', 1000, 2)

    expect(getImportProgress('dl-1')).toEqual({
      percent: 0,
      copiedBytes: 0,
      totalBytes: 1000,
      speedBytesPerSecond: 0,
      filesDone: 0,
      filesTotal: 2
    })
  })

  it('combines finished files with the file currently being copied', () => {
    startImportProgress('dl-1', 1000, 2)
    completeImportFile('dl-1', 400)
    reportImportBytes('dl-1', 300)

    const progress = getImportProgress('dl-1')
    expect(progress?.copiedBytes).toBe(700)
    expect(progress?.percent).toBe(70)
    expect(progress?.filesDone).toBe(1)
  })

  it('never reports more bytes than the torrent size', () => {
    startImportProgress('dl-1', 1000, 2)
    reportImportBytes('dl-1', 1500)

    expect(getImportProgress('dl-1')).toMatchObject({ copiedBytes: 1000, percent: 100 })
  })

  it('estimates the copy speed over a sampling window', () => {
    startImportProgress('dl-1', 10_000, 1)
    vi.advanceTimersByTime(500)
    reportImportBytes('dl-1', 500)
    vi.advanceTimersByTime(500)
    reportImportBytes('dl-1', 1500)

    expect(getImportProgress('dl-1')?.speedBytesPerSecond).toBe(2000)
  })

  it('reports zero percent for an empty torrent', () => {
    startImportProgress('dl-1', 0, 0)
    reportImportBytes('dl-1', 100)

    expect(getImportProgress('dl-1')).toMatchObject({ percent: 0, copiedBytes: 0 })
  })

  it('drops the entry once the import finishes', () => {
    startImportProgress('dl-1', 1000, 1)
    finishImportProgress('dl-1')

    expect(getImportProgress('dl-1')).toBeNull()
  })
})
