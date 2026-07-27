import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGet = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockSet = vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn(), run: mockRun })) }))
const mockUpdate = vi.fn(() => ({ set: mockSet }))

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal(
  'getRouterParam',
  vi.fn((_event: unknown, key: string) => (key === 'id' ? 'req-1' : undefined))
)

vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get: mockGet }))
      }))
    })),
    update: mockUpdate
  }))
)

vi.mock('#server/database/schema', () => ({
  requests: {
    id: 'id',
    userId: 'userId',
    mediaType: 'mediaType',
    mediaId: 'mediaId',
    mediaTitle: 'mediaTitle',
    mediaPoster: 'mediaPoster',
    status: 'status',
    adminNote: 'adminNote',
    updatedAt: 'updatedAt'
  }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

const mockNotifyRequestStatus = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('#server/utils/notifications/notifications', () => ({
  notifyRequestStatus: mockNotifyRequestStatus
}))

import handler from '#server/api/requests/[id].patch'
import { readBody } from 'h3'

describe('requests/[id].patch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('updates status to accepted', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin' } })
    mockGet.mockReturnValue({
      id: 'req-1',
      userId: 'u1',
      mediaType: 'movie',
      mediaId: 123,
      mediaTitle: 'Test',
      mediaPoster: null,
      status: 'pending'
    })
    vi.mocked(readBody).mockResolvedValue({ status: 'accepted' })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }))
  })

  it('updates status to rejected with adminNote', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin' } })
    mockGet.mockReturnValue({
      id: 'req-1',
      userId: 'u1',
      mediaType: 'movie',
      mediaId: 123,
      mediaTitle: 'Test',
      mediaPoster: null,
      status: 'pending'
    })
    vi.mocked(readBody).mockResolvedValue({ status: 'rejected', adminNote: 'Not available' })

    await handler(mockEvent)
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', adminNote: 'Not available' }))
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Admin access required')
  })

  it('throws 400 for invalid status', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin' } })
    vi.mocked(readBody).mockResolvedValue({ status: 'invalid' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid status')
  })

  it('throws 404 when request not found', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin' } })
    mockGet.mockReturnValue(undefined)
    vi.mocked(readBody).mockResolvedValue({ status: 'accepted' })

    await expect(handler(mockEvent)).rejects.toThrow('404: Request not found')
  })

  it('calls notifyRequestStatus', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'admin1', role: 'admin' } })
    mockGet.mockReturnValue({
      id: 'req-1',
      userId: 'u1',
      mediaType: 'movie',
      mediaId: 123,
      mediaTitle: 'Test',
      mediaPoster: null,
      status: 'pending'
    })
    vi.mocked(readBody).mockResolvedValue({ status: 'accepted' })

    await handler(mockEvent)
    expect(mockNotifyRequestStatus).toHaveBeenCalledWith('u1', 'req-1', 'accepted', 'movie', 123, 'Test', null, null)
  })
})
