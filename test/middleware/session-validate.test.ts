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

  it('passes for non-api routes', async () => {
    const event = { path: '/' } as never
    const result = await (handler as Function)(event)
    expect(result).toBeUndefined()
  })

  it('passes for auth routes', async () => {
    const event = { path: '/api/_auth/login' } as never
    const result = await (handler as Function)(event)
    expect(result).toBeUndefined()
  })

  it('passes when no session', async () => {
    mockGetUserSession.mockResolvedValue({ sessionId: null })
    const event = { path: '/api/test' } as never
    const result = await (handler as Function)(event)
    expect(result).toBeUndefined()
  })

  it('clears session and throws 401 when session invalid', async () => {
    mockGetUserSession.mockResolvedValue({ sessionId: 's1' })
    mockValidateSession.mockResolvedValue(false)
    const event = { path: '/api/test' } as never

    await expect((handler as Function)(event)).rejects.toThrow('401: Session expired')
    expect(mockClearUserSession).toHaveBeenCalled()
  })

  it('touches session when interval passed', async () => {
    mockGetUserSession.mockResolvedValue({ sessionId: 's1' })
    mockValidateSession.mockResolvedValue(true)
    const event = { path: '/api/test' } as never

    const result = await (handler as Function)(event)
    expect(result).toBeUndefined()
    expect(mockTouchSession).toHaveBeenCalledWith('s1')
  })

  it('skips touch when recently touched', async () => {
    mockGetUserSession.mockResolvedValue({ sessionId: 's-new' })
    mockValidateSession.mockResolvedValue(true)

    const event = { path: '/api/test' } as never
    await (handler as Function)(event)
    await (handler as Function)(event)

    expect(mockTouchSession).toHaveBeenCalledTimes(1)
  })
})
