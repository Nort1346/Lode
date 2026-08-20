import { describe, it, expect } from 'vitest'
import { isPrivateOrReservedHost, assertExternalUrl } from '#server/utils/url-validate'

describe('isPrivateOrReservedHost', () => {
  it('blocks localhost and reserved hostnames', () => {
    expect(isPrivateOrReservedHost('localhost')).toBe(true)
    expect(isPrivateOrReservedHost('LOCALHOST')).toBe(true)
    expect(isPrivateOrReservedHost('ip6-localhost')).toBe(true)
    expect(isPrivateOrReservedHost('metadata.google.internal')).toBe(true)
  })

  it('blocks standard private IPv4 ranges', () => {
    expect(isPrivateOrReservedHost('127.0.0.1')).toBe(true)
    expect(isPrivateOrReservedHost('10.0.0.5')).toBe(true)
    expect(isPrivateOrReservedHost('172.16.0.1')).toBe(true)
    expect(isPrivateOrReservedHost('172.31.255.255')).toBe(true)
    expect(isPrivateOrReservedHost('192.168.1.1')).toBe(true)
    expect(isPrivateOrReservedHost('169.254.169.254')).toBe(true)
    expect(isPrivateOrReservedHost('0.0.0.0')).toBe(true)
  })

  it('blocks numerically encoded loopback addresses', () => {
    expect(isPrivateOrReservedHost('2130706433')).toBe(true)
    expect(isPrivateOrReservedHost('0x7f000001')).toBe(true)
    expect(isPrivateOrReservedHost('0177.0.0.1')).toBe(true)
    expect(isPrivateOrReservedHost('0x7f.0.0.1')).toBe(true)
  })

  it('blocks IPv6 loopback, ULA, and mapped private addresses', () => {
    expect(isPrivateOrReservedHost('::1')).toBe(true)
    expect(isPrivateOrReservedHost('::')).toBe(true)
    expect(isPrivateOrReservedHost('fc00::1')).toBe(true)
    expect(isPrivateOrReservedHost('fd12:3456::1')).toBe(true)
    expect(isPrivateOrReservedHost('fe80::1')).toBe(true)
    expect(isPrivateOrReservedHost('::ffff:7f00:1')).toBe(true)
    expect(isPrivateOrReservedHost('::ffff:127.0.0.1')).toBe(true)
  })

  it('allows public hostnames and addresses', () => {
    expect(isPrivateOrReservedHost('example.com')).toBe(false)
    expect(isPrivateOrReservedHost('8.8.8.8')).toBe(false)
    expect(isPrivateOrReservedHost('1.1.1.1')).toBe(false)
    expect(isPrivateOrReservedHost('172.32.0.1')).toBe(false)
    expect(isPrivateOrReservedHost('2606:4700:4700::1111')).toBe(false)
  })
})

describe('assertExternalUrl', () => {
  it('allows public http/https URLs', () => {
    expect(() => assertExternalUrl('https://example.com/file.torrent')).not.toThrow()
    expect(() => assertExternalUrl('http://8.8.8.8/file.torrent')).not.toThrow()
  })

  it('throws 400 for malformed URLs', () => {
    expect(() => assertExternalUrl('not a url')).toThrow('400: Invalid URL format')
  })

  it('throws 400 for non-http protocols', () => {
    expect(() => assertExternalUrl('ftp://example.com/file')).toThrow('400: Only HTTP/HTTPS URLs are allowed')
    expect(() => assertExternalUrl('file:///etc/passwd')).toThrow('400: Only HTTP/HTTPS URLs are allowed')
  })

  it('throws 400 for private and encoded targets', () => {
    expect(() => assertExternalUrl('http://127.0.0.1/file')).toThrow(
      '400: URLs to private/internal networks are not allowed'
    )
    expect(() => assertExternalUrl('http://2130706433/file')).toThrow(
      '400: URLs to private/internal networks are not allowed'
    )
    expect(() => assertExternalUrl('http://[::1]/file')).toThrow(
      '400: URLs to private/internal networks are not allowed'
    )
  })
})
