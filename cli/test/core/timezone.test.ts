import { describe, expect, it } from 'vitest'
import { detectSystemTimezone, isValidTimezone } from '../../src/core/timezone'

describe('isValidTimezone', () => {
  it('accepts UTC and IANA names', () => {
    expect(isValidTimezone('UTC')).toBe(true)
    expect(isValidTimezone('Europe/Warsaw')).toBe(true)
    expect(isValidTimezone('America/New_York')).toBe(true)
  })

  it('rejects empty and bogus values', () => {
    expect(isValidTimezone('')).toBe(false)
    expect(isValidTimezone('   ')).toBe(false)
    expect(isValidTimezone('Not/AZone')).toBe(false)
    expect(isValidTimezone('UTC+1')).toBe(false)
  })
})

describe('detectSystemTimezone', () => {
  it('returns a valid IANA zone or null', () => {
    const detected = detectSystemTimezone()
    if (detected !== null) expect(isValidTimezone(detected)).toBe(true)
  })
})
