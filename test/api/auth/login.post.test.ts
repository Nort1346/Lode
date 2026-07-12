import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockRun = vi.fn()
const mockRecordLoginAttempt = vi.fn(() => Promise.resolve())
const mockSetUserSession = vi.fn(() => Promise.resolve())
const mockLogActivity = vi.fn()

vi.stubGlobal('getUserSession', vi.fn())
vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get: mockGet }))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ run: mockRun }))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ run: mockRun }))
    }))
  }))
)
vi.stubGlobal('logActivity', mockLogActivity)
vi.stubGlobal('recordLoginAttempt', mockRecordLoginAttempt)
vi.stubGlobal(
  'enforceMaxSessions',
  vi.fn(() => Promise.resolve())
)
vi.stubGlobal('setUserSession', mockSetUserSession)
vi.stubGlobal(
  'parseDeviceName',
  vi.fn(() => 'Unknown Device')
)
vi.stubGlobal(
  'getRequestIP',
  vi.fn(() => '127.0.0.1')
)
vi.stubGlobal(
  'getRequestHeader',
  vi.fn(() => 'test-agent')
)
vi.stubGlobal('crypto', { randomUUID: () => 'session-uuid' })

vi.mock('node:crypto', () => ({
  randomUUID: () => 'session-uuid'
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  sessions: { id: 'id', userId: 'userId' },
  users: { username: 'username', id: 'id' }
}))

vi.mock('@node-rs/bcrypt', () => ({
  compare: vi.fn()
}))

vi.mock('#server/utils/sync', () => ({
  syncUserDisable: vi.fn(() => Promise.resolve())
}))

import handler from '#server/api/auth/login.post'
import { readBody } from 'h3'
import { compare } from '@node-rs/bcrypt'

describe('auth/login.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  const mockUser = {
    id: 'u1',
    username: 'user1',
    password: 'hashed-pw',
    role: 'user',
    isActive: true,
    expiresAt: null,
    maxSessions: 5,
    dailyDownloadLimit: 5,
    activeTorrentLimit: 3,
    maxTorrentSizeGb: 20,
    privateTrackerLimit: 3,
    downloadsToday: 0
  }

  it('returns user on successful login', async () => {
    vi.mocked(readBody).mockResolvedValue({ username: 'user1', password: 'pass123' })
    mockGet.mockReturnValue(mockUser)
    vi.mocked(compare).mockResolvedValue(true as never)

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, user: { id: 'u1', username: 'user1', role: 'user' } })
  })

  it('throws 400 when missing username', async () => {
    vi.mocked(readBody).mockResolvedValue({ username: '', password: 'pass123' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Username and password are required')
  })

  it('throws 400 when missing password', async () => {
    vi.mocked(readBody).mockResolvedValue({ username: 'user1', password: '' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Username and password are required')
  })

  it('throws 401 when user not found', async () => {
    vi.mocked(readBody).mockResolvedValue({ username: 'nobody', password: 'pass123' })
    mockGet.mockReturnValue(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('401: Invalid credentials')
  })

  it('throws 401 when wrong password', async () => {
    vi.mocked(readBody).mockResolvedValue({ username: 'user1', password: 'wrong' })
    mockGet.mockReturnValue(mockUser)
    vi.mocked(compare).mockResolvedValue(false as never)

    await expect(handler(mockEvent)).rejects.toThrow('401: Invalid credentials')
  })

  it('throws 403 when account expired', async () => {
    vi.mocked(readBody).mockResolvedValue({ username: 'user1', password: 'pass123' })
    mockGet.mockReturnValue({ ...mockUser, expiresAt: '2020-01-01T00:00:00.000Z' })

    await expect(handler(mockEvent)).rejects.toThrow('403: Account has expired')
  })

  it('throws 403 when account deactivated', async () => {
    vi.mocked(readBody).mockResolvedValue({ username: 'user1', password: 'pass123' })
    mockGet.mockReturnValue({ ...mockUser, isActive: false })

    await expect(handler(mockEvent)).rejects.toThrow('403: Account is deactivated')
  })

  it('records failed login attempt', async () => {
    vi.mocked(readBody).mockResolvedValue({ username: 'user1', password: 'wrong' })
    mockGet.mockReturnValue(mockUser)
    vi.mocked(compare).mockResolvedValue(false as never)

    await expect(handler(mockEvent)).rejects.toThrow()
    expect(mockRecordLoginAttempt).toHaveBeenCalledWith(mockEvent, {
      username: 'user1',
      success: false
    })
  })

  it('records successful login attempt', async () => {
    vi.mocked(readBody).mockResolvedValue({ username: 'user1', password: 'pass123' })
    mockGet.mockReturnValue(mockUser)
    vi.mocked(compare).mockResolvedValue(true as never)

    await handler(mockEvent)
    expect(mockRecordLoginAttempt).toHaveBeenCalledWith(mockEvent, {
      username: 'user1',
      success: true
    })
  })

  it('sets user session on success', async () => {
    vi.mocked(readBody).mockResolvedValue({ username: 'user1', password: 'pass123' })
    mockGet.mockReturnValue(mockUser)
    vi.mocked(compare).mockResolvedValue(true as never)

    await handler(mockEvent)
    expect(mockSetUserSession).toHaveBeenCalledWith(
      mockEvent,
      expect.objectContaining({
        user: expect.objectContaining({ id: 'u1', username: 'user1' }),
        sessionId: 'session-uuid'
      })
    )
  })
})
