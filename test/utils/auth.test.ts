import { describe, it, expect, vi } from 'vitest'
import type { H3Event } from 'h3'

const mockEvent = { context: {} } as unknown as H3Event

const mockGetUserSession = vi.hoisted(() => vi.fn())

vi.mock('nuxt-auth-utils', () => ({
  getUserSession: mockGetUserSession
}))

vi.mock('h3', () => ({
  createError: vi.fn((opts) => {
    const err = new Error(opts.statusMessage)
    ;(err as Record<string, unknown>).statusCode = opts.statusCode
    ;(err as Record<string, unknown>).statusMessage = opts.statusMessage
    throw err
  })
}))

import { requireUser, requireAdmin } from '#server/utils/auth'

describe('requireUser', () => {
  it('returns user when session exists', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: '1', role: 'user' } })
    const result = await requireUser(mockEvent)
    expect(result).toEqual({ id: '1', role: 'user' })
  })

  it('throws 401 when no session', async () => {
    mockGetUserSession.mockResolvedValue({})
    await expect(requireUser(mockEvent)).rejects.toThrow('Unauthorized')
  })

  it('throws 401 when session.user is undefined', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })
    await expect(requireUser(mockEvent)).rejects.toThrow('Unauthorized')
  })
})

describe('requireAdmin', () => {
  it('returns user when role is admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: '1', role: 'admin' } })
    const result = await requireAdmin(mockEvent)
    expect(result).toEqual({ id: '1', role: 'admin' })
  })

  it('throws 403 when role is not admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: '1', role: 'user' } })
    await expect(requireAdmin(mockEvent)).rejects.toThrow('Forbidden')
  })
})
