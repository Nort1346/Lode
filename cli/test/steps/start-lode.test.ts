import { describe, expect, it } from 'vitest'
import { extractAdminPassword } from '../../src/steps/start-lode'

describe('extractAdminPassword', () => {
  it('extracts the first unquoted password', () => {
    const logs = 'Admin password: abc123\n'
    expect(extractAdminPassword(logs)).toBe('abc123')
  })

  it('prefers the first match over later ones', () => {
    const logs = 'Admin password: first\nAdmin password: second\n'
    expect(extractAdminPassword(logs)).toBe('first')
  })

  it('skips quoted values and returns an empty string when nothing matches', () => {
    expect(extractAdminPassword('Admin password: "quoted"\n')).toBe('')
    expect(extractAdminPassword('no password here\n')).toBe('')
  })
})
