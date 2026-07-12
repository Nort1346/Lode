import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubGlobal(
  'defineEventHandler',
  vi.fn((fn: unknown) => fn)
)
vi.stubGlobal(
  'createError',
  vi.fn((opts: { statusCode: number; statusMessage: string }) => {
    throw new Error(`${opts.statusCode}: ${opts.statusMessage}`)
  })
)

const mockIsIpBlocked = vi.fn()
const mockResolveIp = vi.fn(() => '1.2.3.4')
const mockGetRequestURL = vi.fn(() => ({ pathname: '/api/auth/login' }))

vi.stubGlobal('isIpBlocked', mockIsIpBlocked)
vi.stubGlobal('resolveIp', mockResolveIp)
vi.stubGlobal('getRequestURL', mockGetRequestURL)

import handler from '#server/middleware/brute-force'

describe('middleware/brute-force', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsIpBlocked.mockReset()
    mockResolveIp.mockReset()
    mockGetRequestURL.mockReset()
    mockResolveIp.mockReturnValue('1.2.3.4')
    mockGetRequestURL.mockReturnValue({ pathname: '/api/auth/login' })
  })

  const mockEvent = { method: 'POST' } as never

  it('passes for non-POST requests', async () => {
    const event = { method: 'GET' } as never
    const result = await (handler as Function)(event)
    expect(result).toBeUndefined()
  })

  it('passes for non-login routes', async () => {
    mockGetRequestURL.mockReturnValue({ pathname: '/api/auth/register' })
    const result = await (handler as Function)(mockEvent)
    expect(result).toBeUndefined()
  })

  it('passes when IP is not blocked', async () => {
    mockIsIpBlocked.mockResolvedValue(false)
    const result = await (handler as Function)(mockEvent)
    expect(result).toBeUndefined()
  })

  it('throws 403 when IP is blocked', async () => {
    mockIsIpBlocked.mockResolvedValue(true)
    await expect((handler as Function)(mockEvent)).rejects.toThrow('403: Too many failed login attempts')
  })

  it('passes when IP is null', async () => {
    mockResolveIp.mockReturnValue(null)
    const result = await (handler as Function)(mockEvent)
    expect(result).toBeUndefined()
  })

  it('passes when IP is empty', async () => {
    mockResolveIp.mockReturnValue('')
    const result = await (handler as Function)(mockEvent)
    expect(result).toBeUndefined()
  })
})
