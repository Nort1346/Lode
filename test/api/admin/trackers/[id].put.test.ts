import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockGetTracker = vi.fn()
const mockGetNameTaken = vi.fn()
const mockReadBody = vi.fn()
const mockGetRouterParam = vi.fn()
const mockLogActivity = vi.fn()
const mockEncryptAES = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/crypto', () => ({
  encryptAES: mockEncryptAES
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  ne: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  customTrackers: { id: 'id', indexerName: 'indexerName' }
}))

import handler from '#server/api/admin/trackers/[id].put'

describe('admin/trackers/[id].put', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('readBody', mockReadBody)
    vi.stubGlobal('getRouterParam', mockGetRouterParam)
    vi.stubGlobal('logActivity', mockLogActivity)
    mockReadBody.mockReset()
    mockGetRouterParam.mockReset()
    mockRun.mockReset()
    mockGetTracker.mockReset()
    mockGetNameTaken.mockReset()
    mockLogActivity.mockReset()
    mockEncryptAES.mockReturnValue('encrypted')
  })

  const mockEvent = {} as never

  function stubDb(existing: unknown, nameTaken: unknown = undefined) {
    let callCount = 0
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              get: vi.fn(() => {
                callCount++
                return callCount === 1 ? existing : nameTaken
              })
            }))
          }))
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              run: mockRun
            }))
          }))
        }))
      }))
    )
  }

  it('updates tracker fields', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin', username: 'admin' } })
    mockGetRouterParam.mockReturnValue('t1')
    mockReadBody.mockResolvedValue({ indexerName: 'Updated', cookie: 'newcookie' })
    stubDb({ id: 't1', indexerName: 'old', trackerType: 'guid' })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
  })

  it('throws 400 when id missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue(null)

    await expect(handler(mockEvent)).rejects.toThrow('400: Tracker ID is required')
  })

  it('throws 404 when tracker not found', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue('t1')
    mockReadBody.mockResolvedValue({ indexerName: 'test' })
    stubDb(undefined)

    await expect(handler(mockEvent)).rejects.toThrow('404: Tracker not found')
  })

  it('throws 409 when name is taken', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockGetRouterParam.mockReturnValue('t1')
    mockReadBody.mockResolvedValue({ indexerName: 'Taken' })
    stubDb({ id: 't1', indexerName: 'old', trackerType: 'guid' }, { id: 't2', indexerName: 'Taken' })

    await expect(handler(mockEvent)).rejects.toThrow('409:')
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
