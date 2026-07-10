import { describe, it, expect, vi } from 'vitest'
import { resolveIp } from '#server/utils/ip'
import type { H3Event } from 'h3'

vi.mock('h3', () => ({
  getHeader: vi.fn((event: H3Event, name: string) => {
    const headers = (event as unknown as Record<string, Record<string, string>>).__headers ?? {}
    return headers[name.toLowerCase()] ?? null
  })
}))

function createMockEvent(headers: Record<string, string>): H3Event {
  return { __headers: headers } as unknown as H3Event
}

describe('resolveIp', () => {
  it('returns cf-connecting-ip when present', () => {
    const event = createMockEvent({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' })
    expect(resolveIp(event)).toBe('1.2.3.4')
  })

  it('falls back to x-forwarded-for when cf-connecting-ip is missing', () => {
    const event = createMockEvent({ 'x-forwarded-for': '5.6.7.8', 'x-real-ip': '9.10.11.12' })
    expect(resolveIp(event)).toBe('5.6.7.8')
  })

  it('uses first IP from x-forwarded-for list', () => {
    const event = createMockEvent({ 'x-forwarded-for': '10.0.0.1, 10.0.0.2, 10.0.0.3' })
    expect(resolveIp(event)).toBe('10.0.0.1')
  })

  it('trims IP from x-forwarded-for', () => {
    const event = createMockEvent({ 'x-forwarded-for': '  192.168.1.1  ' })
    expect(resolveIp(event)).toBe('192.168.1.1')
  })

  it('falls back to x-real-ip when others are missing', () => {
    const event = createMockEvent({ 'x-real-ip': '9.10.11.12' })
    expect(resolveIp(event)).toBe('9.10.11.12')
  })

  it('returns null when no IP headers are present', () => {
    const event = createMockEvent({})
    expect(resolveIp(event)).toBeNull()
  })

  it('ignores empty cf-connecting-ip', () => {
    const event = createMockEvent({ 'cf-connecting-ip': '', 'x-forwarded-for': '5.6.7.8' })
    expect(resolveIp(event)).toBe('5.6.7.8')
  })
})
