import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGet = vi.fn()
const mockRun = vi.fn()

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-123' })
vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get: mockGet }))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ run: mockRun }))
    }))
  }))
)

vi.mock('#server/database/schema', () => ({
  requests: { userId: 'userId', mediaType: 'mediaType', mediaId: 'mediaId' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({}))
}))

vi.mock('#server/utils/discord', () => ({
  notifyRequestPending: vi.fn(() => Promise.resolve())
}))

import handler from '#server/api/requests/post.post'
import { readBody } from 'h3'
import { notifyRequestPending } from '#server/utils/discord'

describe('requests/post.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('creates request successfully', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', username: 'user1' } })
    mockGet.mockReturnValue(undefined)
    vi.mocked(readBody).mockResolvedValue({
      mediaType: 'movie',
      mediaId: 123,
      mediaTitle: 'Test Movie'
    })

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true })
    expect(mockRun).toHaveBeenCalled()
    expect(vi.mocked(notifyRequestPending)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'test-uuid-123', mediaType: 'movie', mediaId: 123 })
    )
  })

  it('throws 400 when missing required fields', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', username: 'user1' } })
    vi.mocked(readBody).mockResolvedValue({ mediaType: 'movie' })

    await expect(handler(mockEvent)).rejects.toThrow('400: Missing required fields')
  })

  it('throws 400 for invalid media type', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', username: 'user1' } })
    vi.mocked(readBody).mockResolvedValue({
      mediaType: 'book',
      mediaId: 123,
      mediaTitle: 'Test'
    })

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid media type')
  })

  it('throws 409 when request is pending', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', username: 'user1' } })
    mockGet.mockReturnValue({ id: 'existing', status: 'pending' })
    vi.mocked(readBody).mockResolvedValue({
      mediaType: 'movie',
      mediaId: 123,
      mediaTitle: 'Test Movie'
    })

    await expect(handler(mockEvent)).rejects.toThrow('409: Already requested')
  })

  it('throws 409 when request was accepted', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', username: 'user1' } })
    mockGet.mockReturnValue({ id: 'existing', status: 'accepted' })
    vi.mocked(readBody).mockResolvedValue({
      mediaType: 'movie',
      mediaId: 123,
      mediaTitle: 'Test Movie'
    })

    await expect(handler(mockEvent)).rejects.toThrow('409: Already accepted')
  })

  it('throws 409 when request was rejected', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', username: 'user1' } })
    mockGet.mockReturnValue({ id: 'existing', status: 'rejected' })
    vi.mocked(readBody).mockResolvedValue({
      mediaType: 'movie',
      mediaId: 123,
      mediaTitle: 'Test Movie'
    })

    await expect(handler(mockEvent)).rejects.toThrow('409: Request was rejected')
  })

  it('sanitizes userNote', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', username: 'user1' } })
    mockGet.mockReturnValue(undefined)
    vi.mocked(readBody).mockResolvedValue({
      mediaType: 'movie',
      mediaId: 123,
      mediaTitle: 'Test Movie',
      userNote: 'line1\nline2  '
    })

    await handler(mockEvent)
    expect(vi.mocked(notifyRequestPending)).toHaveBeenCalledWith(expect.objectContaining({ userNote: 'line1 line2' }))
  })

  it('throws 401 when not authenticated', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler(mockEvent)).rejects.toThrow('401: Not authenticated')
  })
})
