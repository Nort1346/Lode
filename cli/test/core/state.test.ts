import { describe, expect, it } from 'vitest'
import { DEFAULT_SELECTION, parseSelection, parseStateFile, selectionToFile } from '../../src/core/state'

describe('parseStateFile', () => {
  it('parses flat key=value lines and keeps the first occurrence', () => {
    const raw = parseStateFile('version=1\ndbDriver=postgres\n\nbadline\ndbDriver=sqlite\n')
    expect(raw).toEqual({ version: '1', dbDriver: 'postgres' })
  })
})

describe('parseSelection', () => {
  it('falls back to defaults for unknown or missing fields', () => {
    const selection = parseSelection({ dbDriver: 'mysql', qbittorrent: 'external', dozzle: 'true' })
    expect(selection.dbDriver).toBe('sqlite')
    expect(selection.qbittorrent).toBe('external')
    expect(selection.dozzle).toBe(true)
    expect(selection.mediaMode).toBe('local')
    expect(selection.imageTag).toBe('latest')
  })

  it('round-trips through selectionToFile', () => {
    const selection = { ...DEFAULT_SELECTION, dbDriver: 'postgres' as const, dozzle: true }
    const parsed = parseSelection(parseStateFile(selectionToFile(selection)))
    expect(parsed).toEqual(selection)
  })
})
