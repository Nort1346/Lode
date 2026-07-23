import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { H3Event } from 'h3'

const mockEvent = { context: {} } as unknown as H3Event

const mockGetUserSession = vi.fn()
const mockGetFreshUser = vi.fn()

vi.mock('h3', () => ({
  createError: vi.fn((opts) => {
    const err = new Error(opts.statusMessage)
    ;(err as unknown as Record<string, unknown>).statusCode = opts.statusCode
    ;(err as unknown as Record<string, unknown>).statusMessage = opts.statusMessage
    throw err
  })
}))

vi.mock('#server/utils/user', () => ({
  getFreshUser: (...args: unknown[]) => mockGetFreshUser(...args)
}))

import { requireUser, requireAdmin } from '#server/utils/auth'

beforeEach(() => {
  vi.stubGlobal('getUserSession', mockGetUserSession)
  mockGetFreshUser.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requireUser', () => {
  it('returns fresh user from DB when session exists', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: '1', role: 'user' } })
    mockGetFreshUser.mockResolvedValue({ id: '1', role: 'admin', isActive: true })
    const result = await requireUser(mockEvent)
    expect(result).toEqual({ id: '1', role: 'admin', isActive: true })
    expect(mockGetFreshUser).toHaveBeenCalledWith('1')
  })

  it('throws 401 when no session', async () => {
    mockGetUserSession.mockResolvedValue({})
    await expect(requireUser(mockEvent)).rejects.toThrow('Unauthorized')
    expect(mockGetFreshUser).not.toHaveBeenCalled()
  })

  it('throws 401 when session.user is undefined', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })
    await expect(requireUser(mockEvent)).rejects.toThrow('Unauthorized')
    expect(mockGetFreshUser).not.toHaveBeenCalled()
  })

  it('throws 401 when user not found in DB', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: '1', role: 'user' } })
    mockGetFreshUser.mockResolvedValue(undefined)
    await expect(requireUser(mockEvent)).rejects.toThrow('Unauthorized')
  })
})

describe('requireAdmin', () => {
  it('returns user when role is admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    mockGetFreshUser.mockResolvedValue({ id: '1', role: 'admin' })
    const result = await requireAdmin(mockEvent)
    expect(result).toEqual({ id: '1', role: 'admin' })
  })

  it('throws 403 when role is not admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: '1', role: 'user' } })
    mockGetFreshUser.mockResolvedValue({ id: '1', role: 'user' })
    await expect(requireAdmin(mockEvent)).rejects.toThrow('Forbidden')
  })
})
