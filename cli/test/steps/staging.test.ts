import { describe, expect, it } from 'vitest'
import { stagingContainerPath } from '../../src/steps/staging'

describe('stagingContainerPath', () => {
  it('maps media/ host dirs to /media/ container paths', () => {
    expect(stagingContainerPath('media/downloads/movies')).toBe('/media/downloads/movies')
    expect(stagingContainerPath('media/downloads/series')).toBe('/media/downloads/series')
  })

  it('normalizes backslashes, doubled slashes and trailing slashes', () => {
    expect(stagingContainerPath('media\\downloads\\movies')).toBe('/media/downloads/movies')
    expect(stagingContainerPath('media//downloads/movies')).toBe('/media/downloads/movies')
    expect(stagingContainerPath('media/downloads/movies/')).toBe('/media/downloads/movies')
  })

  it('rejects paths outside media/', () => {
    expect(stagingContainerPath('downloads/movies')).toBe(null)
    expect(stagingContainerPath('media')).toBe(null)
    expect(stagingContainerPath('')).toBe(null)
  })

  it('rejects path traversal', () => {
    expect(stagingContainerPath('media/../outside')).toBe(null)
    expect(stagingContainerPath('media/downloads/..')).toBe(null)
    expect(stagingContainerPath('media/./downloads')).toBe(null)
  })
})
