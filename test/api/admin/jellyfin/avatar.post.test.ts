import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockSelectGet = vi.fn()
const mockSyncAvatar = vi.hoisted(() => vi.fn())
const mockValidateAndProcessAvatar = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/db', () => ({
  useDbAsync: vi.fn(() =>
    Promise.resolve({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ get: mockSelectGet }))
        }))
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ run: mockRun }))
        }))
      }))
    })
  ),
  dbGet: vi.fn(async (chain: { get(): unknown }) => chain.get()),
  dbRun: vi.fn(async (chain: { run(): { changes?: number } }) => {
    const result = chain.run()
    return { changes: result?.changes ?? 0 }
  })
}))

vi.mock('#server/utils/sync', () => ({
  syncAvatar: mockSyncAvatar
}))

vi.mock('#server/utils/avatar', () => ({
  validateAndProcessAvatar: mockValidateAndProcessAvatar
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true)
}))

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn()
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  users: { id: 'id', avatarUrl: 'avatarUrl' }
}))

import handler from '#server/api/admin/jellyfin/avatar.post'

const UUID = '123e4567-e89b-12d3-a456-426614174000'

describe('admin/jellyfin/avatar.post', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubAdminAuth(mockGetUserSession)
    vi.stubGlobal('readMultipartFormData', vi.fn())
    mockRun.mockReset()
    mockSyncAvatar.mockReset()
    mockValidateAndProcessAvatar.mockReset()
    mockSyncAvatar.mockResolvedValue(undefined)
    mockValidateAndProcessAvatar.mockResolvedValue(Buffer.from('processed-image'))
    mockSelectGet.mockReturnValue({ id: UUID })
    mockRun.mockReturnValue({ changes: 1 })
  })

  const mockEvent = {} as never

  it('throws 400 when no form data', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.stubGlobal('readMultipartFormData', vi.fn().mockResolvedValue(null))

    await expect(handler(mockEvent)).rejects.toThrow('400: No form data provided')
  })

  it('throws 400 when userId missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.stubGlobal(
      'readMultipartFormData',
      vi
        .fn()
        .mockResolvedValue([{ name: 'avatar', filename: 'photo.jpg', data: Buffer.from('img'), type: 'image/jpeg' }])
    )

    await expect(handler(mockEvent)).rejects.toThrow('400: userId and avatar image are required')
  })

  it('throws 400 when avatar image missing', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.stubGlobal('readMultipartFormData', vi.fn().mockResolvedValue([{ name: 'userId', data: Buffer.from(UUID) }]))

    await expect(handler(mockEvent)).rejects.toThrow('400: userId and avatar image are required')
  })

  it('throws 400 for non-UUID userId', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.stubGlobal(
      'readMultipartFormData',
      vi.fn().mockResolvedValue([
        { name: 'userId', data: Buffer.from('u1/../etc') },
        { name: 'avatar', filename: 'photo.jpg', data: Buffer.from('img'), type: 'image/jpeg' }
      ])
    )

    await expect(handler(mockEvent)).rejects.toThrow('400: Invalid userId format')
  })

  it('throws 404 when user does not exist', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    mockSelectGet.mockReturnValue(undefined)
    vi.stubGlobal(
      'readMultipartFormData',
      vi.fn().mockResolvedValue([
        { name: 'userId', data: Buffer.from(UUID) },
        { name: 'avatar', filename: 'photo.jpg', data: Buffer.from('img'), type: 'image/jpeg' }
      ])
    )

    await expect(handler(mockEvent)).rejects.toThrow('404: User not found')
    expect(mockValidateAndProcessAvatar).not.toHaveBeenCalled()
  })

  it('uploads avatar and syncs to jellyfin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.stubGlobal(
      'readMultipartFormData',
      vi.fn().mockResolvedValue([
        { name: 'userId', data: Buffer.from(UUID) },
        { name: 'avatar', filename: 'photo.jpg', data: Buffer.from('img'), type: 'image/jpeg' }
      ])
    )

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, avatarUrl: `/avatars/${UUID}.jpg` })
    expect(mockValidateAndProcessAvatar).toHaveBeenCalled()
    expect(mockSyncAvatar).toHaveBeenCalled()
    expect(mockRun).toHaveBeenCalled()
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
