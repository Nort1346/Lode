import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockClearUserSession = vi.fn()
const mockLogActivity = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('clearUserSession', mockClearUserSession)
vi.stubGlobal('logActivity', mockLogActivity)
vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    delete: vi.fn(() => ({ where: vi.fn(() => ({ run: mockRun, get: vi.fn() })) }))
  }))
)

vi.mock('h3', () => ({
  defineEventHandler: (fn: unknown) => fn,
  createError: (opts: { statusCode: number; statusMessage: string }) => {
    throw new Error(`${opts.statusCode}: ${opts.statusMessage}`)
  }
}))

vi.mock('#server/database/schema', () => ({
  sessions: { id: 'id' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

import handler from '#server/api/auth/logout.post'

describe('auth/logout.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('clears session and returns success', async () => {
    mockGetUserSession.mockResolvedValue({
      user: { id: 'u1', username: 'test' },
      sessionId: 'sess-1'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockClearUserSession).toHaveBeenCalledWith(mockEvent)
  })

  it('deletes session from DB when sessionId exists', async () => {
    mockGetUserSession.mockResolvedValue({
      user: { id: 'u1', username: 'test' },
      sessionId: 'sess-1'
    })

    await handler(mockEvent)
    expect(mockRun).toHaveBeenCalled()
  })

  it('skips DB delete when no sessionId', async () => {
    mockGetUserSession.mockResolvedValue({
      user: { id: 'u1', username: 'test' },
      sessionId: undefined
    })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('logs activity with user info', async () => {
    mockGetUserSession.mockResolvedValue({
      user: { id: 'u1', username: 'test' },
      sessionId: 'sess-1'
    })

    await handler(mockEvent)
    expect(mockLogActivity).toHaveBeenCalledWith(mockEvent, {
      action: 'logout',
      userId: 'u1',
      username: 'test'
    })
  })
})
