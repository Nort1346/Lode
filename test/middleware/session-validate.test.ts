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

const mockGetUserSession = vi.fn()
const mockClearUserSession = vi.fn()
const mockValidateSession = vi.fn()
const mockTouchSession = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('clearUserSession', mockClearUserSession)
vi.stubGlobal('validateSession', mockValidateSession)
vi.stubGlobal('touchSession', mockTouchSession)

import handler from '#server/middleware/session-validate'

describe('middleware/session-validate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserSession.mockReset()
    mockValidateSession.mockReset()
    mockClearUserSession.mockReset()
    mockTouchSession.mockReset()
  })

  const callHandler = handler as (event: unknown) => Promise<unknown>

  it('passes for non-api routes', async () => {
    const event = { path: '/' } as never
    const result = await callHandler(event)
    expect(result).toBeUndefined()
  })

  it('passes for auth routes', async () => {
    const event = { path: '/api/_auth/login' } as never
    const result = await callHandler(event)
    expect(result).toBeUndefined()
  })

  it('passes when no session', async () => {
    mockGetUserSession.mockResolvedValue({ sessionId: null })
    const event = { path: '/api/test' } as never
    const result = await callHandler(event)
    expect(result).toBeUndefined()
  })

  it('clears session and throws 401 when session invalid', async () => {
    mockGetUserSession.mockResolvedValue({ sessionId: 's1' })
    mockValidateSession.mockResolvedValue({ valid: false })
    const event = { path: '/api/test' } as never

    await expect(callHandler(event)).rejects.toThrow('401: Session expired')
    expect(mockClearUserSession).toHaveBeenCalled()
  })

  it('clears session and throws 401 when user is disabled', async () => {
    mockGetUserSession.mockResolvedValue({ sessionId: 's1' })
    mockValidateSession.mockResolvedValue({ valid: true, userActive: false })
    const event = { path: '/api/test' } as never

    await expect(callHandler(event)).rejects.toThrow('401: Account disabled')
    expect(mockClearUserSession).toHaveBeenCalled()
  })

  it('touches session when interval passed', async () => {
    mockGetUserSession.mockResolvedValue({ sessionId: 's1' })
    mockValidateSession.mockResolvedValue({ valid: true, userActive: true })
    const event = { path: '/api/test' } as never

    const result = await callHandler(event)
    expect(result).toBeUndefined()
    expect(mockTouchSession).toHaveBeenCalledWith('s1')
  })

  it('skips touch when recently touched', async () => {
    mockGetUserSession.mockResolvedValue({ sessionId: 's-new' })
    mockValidateSession.mockResolvedValue({ valid: true, userActive: true })

    const event = { path: '/api/test' } as never
    await callHandler(event)
    await callHandler(event)

    expect(mockTouchSession).toHaveBeenCalledTimes(1)
  })

  it('treats getUserSession rejection as no session', async () => {
    mockGetUserSession.mockRejectedValue(new Error('corrupt cookie'))
    const event = { path: '/api/test' } as never
    const result = await callHandler(event)
    expect(result).toBeUndefined()
  })

  it('passes when event.path is undefined', async () => {
    const event = { path: undefined } as never
    const result = await callHandler(event)
    expect(result).toBeUndefined()
  })

  it('passes when sessionId is undefined', async () => {
    mockGetUserSession.mockResolvedValue({ sessionId: undefined })
    const event = { path: '/api/test' } as never
    const result = await callHandler(event)
    expect(result).toBeUndefined()
  })
})
