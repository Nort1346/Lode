import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockReadBody = vi.fn()
const mockGetRouterParam = vi.fn()
const mockPerformTrackerLogin = vi.hoisted(() => vi.fn())
const mockDecryptAES = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/tracker-auth', () => ({
  performTrackerLogin: mockPerformTrackerLogin
}))

vi.mock('#server/utils/crypto', () => ({
  decryptAES: mockDecryptAES
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  customTrackers: { id: 'id', loginUrl: 'loginUrl', loginUsername: 'loginUsername', loginPassword: 'loginPassword' }
}))

import handler from '#server/api/admin/trackers/test-login.post'

describe('admin/trackers/test-login.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('readBody', mockReadBody)
    vi.stubGlobal('getRouterParam', mockGetRouterParam)
    mockReadBody.mockReset()
    mockGetRouterParam.mockReset()
    mockPerformTrackerLogin.mockReset()
    mockDecryptAES.mockReset()
  })

  const mockEvent = {} as never

  function stubDb(tracker: unknown = undefined) {
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              get: vi.fn(() => tracker)
            }))
          }))
        }))
      }))
    )
  }

  it('tests login with provided credentials', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue(undefined)
    mockReadBody.mockResolvedValue({
      loginUrl: 'https://example.com/login',
      loginUsername: 'user',
      loginPassword: 'pass'
    })
    mockPerformTrackerLogin.mockResolvedValue('session=abc; path=/')

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining('Login OK')
      })
    )
  })

  it('loads credentials from tracker when router param provided', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue('t1')
    mockReadBody.mockResolvedValue({})
    mockDecryptAES.mockReturnValue('decrypted_pass')
    stubDb({ id: 't1', loginUrl: 'https://example.com/login', loginUsername: 'user', loginPassword: 'encrypted' })
    mockPerformTrackerLogin.mockResolvedValue('session=abc')

    const result = await handler(mockEvent)
    expect(result).toEqual(expect.objectContaining({ success: true }))
    expect(mockDecryptAES).toHaveBeenCalledWith('encrypted')
  })

  it('returns failure when login fails', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue(undefined)
    mockReadBody.mockResolvedValue({
      loginUrl: 'https://example.com/login',
      loginUsername: 'user',
      loginPassword: 'wrong'
    })
    mockPerformTrackerLogin.mockRejectedValue(new Error('Invalid credentials'))

    const result = await handler(mockEvent)
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: 'Invalid credentials'
      })
    )
  })

  it('throws 400 when credentials missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue(undefined)
    mockReadBody.mockResolvedValue({})
    stubDb()

    await expect(handler(mockEvent)).rejects.toThrow('400:')
  })

  it('throws 404 when tracker not found', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue('t1')
    mockReadBody.mockResolvedValue({})
    stubDb(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('404: Tracker not found')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
