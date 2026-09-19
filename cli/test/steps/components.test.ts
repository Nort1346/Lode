import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { externalUrlDefault, isValidHttpUrl } from '../../src/steps/components'

describe('isValidHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isValidHttpUrl('http://localhost:8080')).toBe(true)
    expect(isValidHttpUrl('https://nas.example:9696')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isValidHttpUrl('ftp://x')).toBe(false)
    expect(isValidHttpUrl('localhost')).toBe(false)
    expect(isValidHttpUrl('')).toBe(false)
  })
})

describe('externalUrlDefault', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'lode-components-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('falls back to empty when the stored value is the internal URL', () => {
    writeFileSync(path.join(dir, '.env'), 'NUXT_QBITTORRENT_URL=http://qbittorrent:8080\n')
    expect(externalUrlDefault(dir, 'NUXT_QBITTORRENT_URL', 'http://qbittorrent:8080')).toBe('')
  })

  it('returns the stored external URL', () => {
    writeFileSync(path.join(dir, '.env'), 'NUXT_QBITTORRENT_URL=http://nas:8080\n')
    expect(externalUrlDefault(dir, 'NUXT_QBITTORRENT_URL', 'http://qbittorrent:8080')).toBe('http://nas:8080')
  })
})
