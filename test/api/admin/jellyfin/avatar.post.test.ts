import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stubAdminAuth } from '../../helpers'

const mockGetUserSession = vi.fn()
const mockRun = vi.fn(() => ({ changes: 1 }))
const mockSyncAvatar = vi.hoisted(() => vi.fn())
const mockValidateAndProcessAvatar = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/sync', () => ({
  syncAvatar: mockSyncAvatar
}))

vi.mock('#server/utils/avatar', () => ({
  validateAndProcessAvatar: mockValidateAndProcessAvatar
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn()
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({}))
}))

vi.mock('#server/database/schema', () => ({
  users: { id: 'id', avatarUrl: 'avatarUrl' }
}))

import handler from '#server/api/admin/jellyfin/avatar.post'

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
  })

  const mockEvent = {} as never

  function stubDb() {
    vi.stubGlobal(
      'useDb',
      vi.fn(() => ({
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              get: vi.fn(),
              run: mockRun
            }))
          }))
        }))
      }))
    )
  }

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
    vi.stubGlobal('readMultipartFormData', vi.fn().mockResolvedValue([{ name: 'userId', data: Buffer.from('u1') }]))

    await expect(handler(mockEvent)).rejects.toThrow('400: userId and avatar image are required')
  })

  it('uploads avatar and syncs to jellyfin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    vi.stubGlobal(
      'readMultipartFormData',
      vi.fn().mockResolvedValue([
        { name: 'userId', data: Buffer.from('u1') },
        { name: 'avatar', filename: 'photo.jpg', data: Buffer.from('img'), type: 'image/jpeg' }
      ])
    )
    stubDb()

    const result = await handler(mockEvent)
    expect(result).toEqual({ success: true, avatarUrl: '/avatars/u1.jpg' })
    expect(mockValidateAndProcessAvatar).toHaveBeenCalled()
    expect(mockSyncAvatar).toHaveBeenCalled()
    expect(mockRun).toHaveBeenCalled()
  })

  it('throws 403 for non-admin', async () => {
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1', role: 'user' } })

    await expect(handler(mockEvent)).rejects.toThrow('403: Forbidden')
  })
})
