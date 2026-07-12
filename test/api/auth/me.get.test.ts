import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (fn: unknown) => fn,
  createError: (opts: { statusCode: number; statusMessage: string }) => {
    throw new Error(`${opts.statusCode}: ${opts.statusMessage}`)
  }
}))

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('createError', (opts: { statusCode: number; statusMessage: string }) => {
  throw new Error(`${opts.statusCode}: ${opts.statusMessage}`)
})

import handler from '#server/api/auth/me.get'

describe('auth/me.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('returns user when authenticated', async () => {
    mockGetUserSession.mockResolvedValue({
      user: { id: 'u1', username: 'testuser', role: 'user' }
    })

    const result = await handler(mockEvent)
    expect(result).toEqual({
      user: { id: 'u1', username: 'testuser', role: 'user' }
    })
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })

  it('throws 401 when session is empty', async () => {
    mockGetUserSession.mockResolvedValue({})

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
