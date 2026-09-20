import { describe, expect, it } from 'vitest'
import { extractQbitTempPassword, parseComposeProgress } from '../../src/steps/services'

describe('extractQbitTempPassword', () => {
  it('extracts the last temporary password (container restarts print a new one)', () => {
    const logs = [
      'qbit | A temporary password is provided for this session: firstpass',
      'qbit | restart',
      'qbit | A temporary password is provided for this session: secondpass'
    ].join('\n')
    expect(extractQbitTempPassword(logs)).toBe('secondpass')
  })

  it('returns an empty string when the logs contain no password line', () => {
    expect(extractQbitTempPassword('nothing relevant here\n')).toBe('')
  })
})

describe('parseComposeProgress', () => {
  it('parses compose v5 layer lines (no colon, trailing size)', () => {
    expect(parseComposeProgress('25f1d6b1951a Pulling fs layer 0B')).toBe('pulling')
    expect(parseComposeProgress(' 25f1d6b1951a Downloading 48.51kB')).toBe('downloading')
    expect(parseComposeProgress('25f1d6b1951a Download complete 0B')).toBe('downloaded')
    expect(parseComposeProgress('25f1d6b1951a Verifying Checksum 0B')).toBe('verifying')
    expect(parseComposeProgress('25f1d6b1951a Extracting 3.63MB')).toBe('extracting')
    expect(parseComposeProgress('25f1d6b1951a Pull complete 0B')).toBe('ready')
  })

  it('parses legacy layer lines (colon after the layer id)', () => {
    expect(parseComposeProgress('1b9f390bf7a8: Pulling fs layer')).toBe('pulling')
    expect(parseComposeProgress('1b9f390bf7a8: Downloading')).toBe('downloading')
    expect(parseComposeProgress('1b9f390bf7a8: Mounted from cache')).toBe('cached')
  })

  it('returns null for image status lines and noise', () => {
    expect(parseComposeProgress('Image alpine:3.20 Pulling ')).toBeNull()
    expect(parseComposeProgress(' Image lscr.io/linuxserver/qbittorrent:latest Pulled ')).toBeNull()
    expect(parseComposeProgress('')).toBeNull()
  })
})
