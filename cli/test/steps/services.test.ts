import { describe, expect, it } from 'vitest'
import { extractQbitTempPassword } from '../../src/steps/services'

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
