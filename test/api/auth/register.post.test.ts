import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGet = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockLogActivity = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
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
        where: vi.fn(() => ({ run: mockRun, get: vi.fn() }))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ run: mockRun, get: vi.fn() }))
    }))
  }))
)
vi.stubGlobal('logActivity', mockLogActivity)

vi.mock('node:crypto', () => ({
  randomUUID: () => 'user-uuid'
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  users: { username: 'username', id: 'id' }
}))

vi.mock('@node-rs/bcrypt', () => ({
  hash: vi.fn(() => Promise.resolve('hashed-pw'))
}))

const mockSyncNewUser = vi.hoisted(() => vi.fn(() => Promise.resolve('synced' as const)))
const mockGetSetting = vi.hoisted(() => vi.fn(() => Promise.resolve(null)))
vi.mock('#server/utils/sync', () => ({
  syncNewUser: mockSyncNewUser,
  getDefaultSyncSettings: vi.fn(() => ({}))
}))

vi.mock('#server/utils/settings', () => ({
  getSetting: mockGetSetting
}))

import handler from '#server/api/auth/register.post'
import { readBody } from 'h3'
import { hash } from '@node-rs/bcrypt'
import { syncNewUser } from '#server/utils/sync'

describe('auth/register.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('creates user successfully as admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', username: 'admin', role: 'admin' } } as never)
    vi.mocked(readBody).mockResolvedValue({ username: 'newuser', password: 'pass1234' })
    mockGet.mockReturnValue(undefined)

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, id: 'user-uuid' })
    expect(vi.mocked(hash)).toHaveBeenCalledWith('pass1234', 12)
    expect(mockRun).toHaveBeenCalled()
  })

  it('throws 400 when missing username', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin' } } as never)
    vi.mocked(readBody).mockResolvedValue({ username: '', password: 'pass1234' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Username and password are required')
  })

  it('throws 400 when missing password', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin' } } as never)
    vi.mocked(readBody).mockResolvedValue({ username: 'newuser', password: '' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Username and password are required')
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined } as never)

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })

  it('throws 403 when non-admin tries to create user', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } } as never)
    vi.mocked(readBody).mockResolvedValue({ username: 'newuser', password: 'pass1234' })

    await expect(handler(mockEvent)).rejects.toThrow('403: Only admins can create users')
  })

  it('throws 409 when username already exists', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin' } } as never)
    vi.mocked(readBody).mockResolvedValue({ username: 'existing', password: 'pass1234' })
    mockGet.mockReturnValue({ id: 'existing-user', username: 'existing' })

    await expect(handler(mockEvent)).rejects.toThrow('409: Username already exists')
  })

  it('sets syncStatus to failed when sync fails', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin' } } as never)
    vi.mocked(readBody).mockResolvedValue({ username: 'newuser', password: 'pass1234' })
    mockGet.mockReturnValue(undefined)
    vi.mocked(syncNewUser).mockResolvedValue('failed')

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, id: 'user-uuid' })
    expect(mockRun).toHaveBeenCalledTimes(2)
  })

  it('calls syncNewUser after insert', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin' } } as never)
    vi.mocked(readBody).mockResolvedValue({ username: 'newuser', password: 'pass1234' })
    mockGet.mockReturnValue(undefined)

    await handler(mockEvent)
    expect(vi.mocked(syncNewUser)).toHaveBeenCalledWith(
      'user-uuid',
      { username: 'newuser', password: 'pass1234' },
      expect.any(Object)
    )
  })
})
