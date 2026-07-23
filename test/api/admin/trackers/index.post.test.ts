import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockGetExisting = vi.fn()
const mockReadBody = vi.fn()
const mockLogActivity = vi.fn()
const mockRandomUUID = vi.hoisted(() => vi.fn())
const mockEncryptAES = vi.hoisted(() => vi.fn())

vi.mock('node:crypto', () => ({
  randomUUID: mockRandomUUID
}))

vi.mock('#server/utils/crypto', () => ({
  encryptAES: mockEncryptAES
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  customTrackers: { indexerName: 'indexerName' }
}))

import handler from '#server/api/admin/trackers/index.post'

describe('admin/trackers/index.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('readBody', mockReadBody)
    vi.stubGlobal('logActivity', mockLogActivity)
    mockReadBody.mockReset()
    mockRun.mockReset()
    mockGetExisting.mockReset()
    mockLogActivity.mockReset()
    mockRandomUUID.mockReturnValue('tracker-id-1')
    mockEncryptAES.mockReturnValue('encrypted')
  })

  const mockEvent = {} as never

  function stubDb(existing: unknown = undefined) {
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              get: vi.fn(() => existing)
            }))
          }))
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            run: mockRun,
            get: vi.fn()
          }))
        }))
      }))
    )
  }

  it('creates tracker with cookie', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({ indexerName: 'MyTracker', cookie: 'session123' })
    stubDb(undefined)

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, id: 'tracker-id-1' })
    expect(mockRun).toHaveBeenCalled()
  })

  it('creates tracker with login credentials', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockReadBody.mockResolvedValue({
      indexerName: 'MyTracker',
      trackerType: 'guid',
      loginUrl: 'https://example.com/login',
      loginUsername: 'user',
      loginPassword: 'pass'
    })
    stubDb(undefined)

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, id: 'tracker-id-1' })
  })

  it('throws 400 when indexerName missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ cookie: 'abc' })
    stubDb()

    await expect(handler(mockEvent)).rejects.toThrow('400: indexerName is required')
  })

  it('throws 409 when tracker already exists', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockReadBody.mockResolvedValue({ indexerName: 'Existing', cookie: 'abc' })
    stubDb({ id: 't1', indexerName: 'Existing' })

    await expect(handler(mockEvent)).rejects.toThrow('409:')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
