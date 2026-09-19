import { describe, expect, it } from 'vitest'
import { generateHexKey, generatePassword } from '../../src/core/secrets'

describe('generatePassword', () => {
  it('returns the requested length of alphanumerics', () => {
    const password = generatePassword(32)
    expect(password).toHaveLength(32)
    expect(password).toMatch(/^[a-zA-Z0-9]+$/)
  })

  it('generates different values on each call', () => {
    expect(generatePassword(32)).not.toBe(generatePassword(32))
  })
})

describe('generateHexKey', () => {
  it('returns lowercase hex of twice the byte length', () => {
    const key = generateHexKey(32)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })
})
