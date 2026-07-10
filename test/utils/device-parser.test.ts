import { describe, it, expect } from 'vitest'
import { parseDeviceName } from '#server/utils/device-parser'

describe('parseDeviceName', () => {
  it('returns Unknown device for null UA', () => {
    expect(parseDeviceName(null)).toBe('Unknown device')
  })

  it('returns Unknown device for undefined UA', () => {
    expect(parseDeviceName(undefined)).toBe('Unknown device')
  })

  it('returns Unknown device for empty UA', () => {
    expect(parseDeviceName('')).toBe('Unknown device')
  })

  it('parses Chrome on Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    expect(parseDeviceName(ua)).toBe('Chrome v120 on Windows')
  })

  it('parses Firefox on macOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.2; rv:121.0) Gecko/20100101 Firefox/121.0'
    expect(parseDeviceName(ua)).toBe('Firefox v121 on macOS v14.2')
  })

  it('parses Safari on macOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 Version/17.2 Safari/605.1.15'
    expect(parseDeviceName(ua)).toBe('Safari v17 on macOS v14.2')
  })

  it('parses Edge on Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/120.0.0.0 Safari/537.36'
    expect(parseDeviceName(ua)).toBe('Edge v120 on Windows')
  })

  it('parses Chrome on Android', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
    expect(parseDeviceName(ua)).toBe('Chrome v120 on Android v14')
  })

  it('parses Safari on iPhone', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Version/17.2 Mobile/15E148 Safari/604.1'
    expect(parseDeviceName(ua)).toBe('Safari v17 on iPhone v17.2')
  })

  it('parses Opera on Linux', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 OPR/100.0.0.0 Safari/537.36'
    expect(parseDeviceName(ua)).toBe('Opera v100 on Linux')
  })

  it('returns browser name without version when version is missing', () => {
    const ua = 'Mozilla/5.0 Firefox'
    expect(parseDeviceName(ua)).toBe('Firefox')
  })

  it('detects ChromeOS', () => {
    const ua = 'Mozilla/5.0 (X11; CrOS x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    expect(parseDeviceName(ua)).toBe('Chrome v120 on ChromeOS')
  })

  it('detects iPad', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Version/17.2 Mobile/15E148 Safari/604.1'
    expect(parseDeviceName(ua)).toBe('Safari v17 on iPad')
  })

  it('detects Windows 7', () => {
    const ua = 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) Chrome/120.0.0.0'
    expect(parseDeviceName(ua)).toBe('Chrome v120 on Windows 7')
  })

  it('detects Windows 8', () => {
    const ua = 'Mozilla/5.0 (Windows NT 6.2; Win64; x64) Chrome/120.0.0.0'
    expect(parseDeviceName(ua)).toBe('Chrome v120 on Windows 8')
  })

  it('detects Windows 8.1', () => {
    const ua = 'Mozilla/5.0 (Windows NT 6.3; Win64; x64) Chrome/120.0.0.0'
    expect(parseDeviceName(ua)).toBe('Chrome v120 on Windows 8.1')
  })
})
