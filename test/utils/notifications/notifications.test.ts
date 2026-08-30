import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDbSelect = vi.fn()
const mockDbInsert = vi.fn()
const mockDbUpdate = vi.fn()

vi.stubGlobal(
  'useDbAsync',
  vi.fn(() =>
    Promise.resolve({
      select: mockDbSelect,
      insert: mockDbInsert,
      update: mockDbUpdate
    })
  )
)

vi.mock('#server/utils/db', () => ({
  useDbAsync: vi.fn(() =>
    Promise.resolve({
      select: mockDbSelect,
      insert: mockDbInsert,
      update: mockDbUpdate
    })
  ),
  dbGet: vi.fn(async (chain: { get(): unknown }) => chain.get()),
  dbAll: vi.fn(async (chain: { all(): unknown[] }) => chain.all()),
  dbRun: vi.fn(async (chain: { run(): { changes?: number } }) => {
    const result = chain.run()
    return { changes: result?.changes ?? 0 }
  })
}))

vi.mock('#server/utils/notifications/sse-hubs', () => ({
  notifySseClients: vi.fn()
}))

vi.mock('#server/utils/notifications/push', () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() })
}))

vi.mock('#server/utils/i18n-server', () => ({
  createT:
    () =>
    (key: string): string => {
      const translations: Record<string, string> = {
        'notifications.download_complete.title': 'Download Complete',
        'notifications.download_complete.message': 'Your download "{title}" is ready.',
        'notifications.request_accepted.title': 'Request Accepted',
        'notifications.request_accepted.message': 'Your request "{title}" has been accepted.',
        'notifications.request_rejected.title': 'Request Rejected',
        'notifications.request_rejected.message': 'Your request "{title}" has been rejected.'
      }
      return translations[key] ?? key
    },
  DISCORD_LOCALE_OPTIONS: ['pl', 'en', 'de', 'fr', 'es', 'pt-BR']
}))

vi.mock('#server/database/schema', () => ({
  notifications: {
    id: 'id',
    userId: 'userId',
    type: 'type',
    title: 'title',
    message: 'message',
    link: 'link',
    data: 'data',
    read: 'read',
    createdAt: 'createdAt'
  },
  settings: {
    key: 'key',
    value: 'value'
  }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
  count: vi.fn(() => 'count')
}))

vi.mock('node:crypto', () => ({
  randomUUID: () => 'test-uuid-1234'
}))

import {
  createNotification,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  notifyDownloadComplete
} from '#server/utils/notifications/notifications'
import { notifySseClients } from '#server/utils/notifications/sse-hubs'
import { sendPushToUser } from '#server/utils/notifications/push'
import { NotificationType } from '#server/types/notifications'

describe('notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createNotification', () => {
    it('inserts new notification when none exists', async () => {
      const mockGet = vi.fn(() => undefined)
      const mockRun = vi.fn(() => ({ changes: 1 }))
      mockDbSelect.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ get: mockGet }))
        }))
      })
      mockDbInsert.mockReturnValue({
        values: vi.fn(() => ({ run: mockRun }))
      })

      await createNotification(
        'user1',
        NotificationType.DOWNLOAD_COMPLETE as never,
        {
          downloadId: 'dl1',
          mediaType: 'movie',
          mediaTitle: 'Test Movie',
          posterUrl: null,
          sizeBytes: 1000,
          savePath: '/downloads'
        } as never,
        'Download Complete',
        'Your download is ready'
      )

      expect(mockDbInsert).toHaveBeenCalled()
      expect(mockRun).toHaveBeenCalled()
      expect(notifySseClients).toHaveBeenCalled()
      expect(sendPushToUser).toHaveBeenCalled()
    })

    it('updates existing unread notification of same type', async () => {
      const mockGet = vi.fn(() => ({ id: 'existing-id' }))
      const mockRun = vi.fn(() => ({ changes: 1 }))
      mockDbSelect.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ get: mockGet }))
        }))
      })
      mockDbUpdate.mockReturnValue({
        set: vi.fn(() => ({ where: vi.fn(() => ({ run: mockRun })) }))
      })

      await createNotification(
        'user1',
        NotificationType.DOWNLOAD_COMPLETE as never,
        {
          downloadId: 'dl1',
          mediaType: 'movie',
          mediaTitle: 'Updated Movie',
          posterUrl: null,
          sizeBytes: 2000,
          savePath: '/downloads'
        } as never,
        'Updated',
        'New message'
      )

      expect(mockDbUpdate).toHaveBeenCalled()
      expect(mockRun).toHaveBeenCalled()
    })

    it('keeps title, link and data consistent when overlapping downloads complete', async () => {
      const inserted: Record<string, unknown>[] = []
      const updated: Record<string, unknown>[] = []

      // first completion: no unread row yet, so a row is inserted
      mockDbSelect.mockReturnValue({
        from: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn(() => undefined) })) }))
      })
      mockDbInsert.mockReturnValue({
        values: vi.fn((values: Record<string, unknown>) => {
          inserted.push(values)
          return { run: vi.fn(() => ({ changes: 1 })) }
        })
      })

      await notifyDownloadComplete(
        'user1',
        'dl-avengers',
        'movie',
        'Avengers',
        'https://image.tmdb.org/p/avengers.jpg',
        1000,
        'movies',
        299536
      )

      expect(inserted).toHaveLength(1)
      const firstData = JSON.parse(String(inserted[0]?.data ?? '{}')) as {
        posterUrl: string | null
        downloadId: string
      }
      expect(inserted[0]).toEqual(
        expect.objectContaining({
          title: 'Avengers',
          link: '/browse/movie/299536',
          data: expect.any(String)
        })
      )
      expect(firstData).toEqual(
        expect.objectContaining({ posterUrl: 'https://image.tmdb.org/p/avengers.jpg', downloadId: 'dl-avengers' })
      )

      // second completion while the first notification is still unread: the row is reused
      mockDbSelect.mockReturnValue({
        from: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn(() => ({ id: 'existing-id' })) })) }))
      })
      mockDbUpdate.mockReturnValue({
        set: vi.fn((values: Record<string, unknown>) => {
          updated.push(values)
          return { where: vi.fn(() => ({ run: vi.fn(() => ({ changes: 1 })) })) }
        })
      })

      await notifyDownloadComplete(
        'user1',
        'dl-sheep',
        'movie',
        'The Sheep Detectives',
        'https://image.tmdb.org/p/sheep.jpg',
        2000,
        'movies',
        123456
      )

      expect(updated).toHaveLength(1)
      expect(updated[0]).toEqual(
        expect.objectContaining({
          title: 'The Sheep Detectives',
          message: expect.stringContaining('The Sheep Detectives'),
          link: '/browse/movie/123456',
          data: expect.any(String)
        })
      )
      const secondData = JSON.parse(String(updated[0]?.data ?? '{}')) as {
        posterUrl: string | null
        downloadId: string
      }
      expect(secondData).toEqual(
        expect.objectContaining({ posterUrl: 'https://image.tmdb.org/p/sheep.jpg', downloadId: 'dl-sheep' })
      )
    })
  })

  describe('getUserNotifications', () => {
    it('returns parsed notifications for user', async () => {
      const mockAll = vi.fn(() => [
        {
          id: 'n1',
          userId: 'user1',
          type: 'download_complete',
          title: 'Test',
          message: 'Msg',
          link: '/test',
          data: '{"downloadId":"d1"}',
          read: false,
          createdAt: '2025-01-01T00:00:00.000Z'
        }
      ])
      mockDbSelect.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({ all: mockAll }))
            }))
          }))
        }))
      })

      const result = await getUserNotifications('user1')
      expect(result).toHaveLength(1)
      expect(result[0]!.data).toEqual({ downloadId: 'd1' })
    })

    it('returns empty array when no notifications', async () => {
      const mockAll = vi.fn(() => [])
      mockDbSelect.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({ all: mockAll }))
            }))
          }))
        }))
      })

      const result = await getUserNotifications('user1')
      expect(result).toEqual([])
    })
  })

  describe('getUnreadCount', () => {
    it('returns unread count', async () => {
      const mockAll = vi.fn(() => [{ count: 5 }])
      mockDbSelect.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ all: mockAll }))
        }))
      })

      expect(await getUnreadCount('user1')).toBe(5)
    })

    it('returns 0 when no unread', async () => {
      const mockAll = vi.fn(() => [{ count: 0 }])
      mockDbSelect.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ all: mockAll }))
        }))
      })

      expect(await getUnreadCount('user1')).toBe(0)
    })

    it('returns 0 when no results', async () => {
      const mockAll = vi.fn(() => [])
      mockDbSelect.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ all: mockAll }))
        }))
      })

      expect(await getUnreadCount('user1')).toBe(0)
    })
  })

  describe('markAsRead', () => {
    it('marks notification as read and notifies SSE', async () => {
      const mockRun = vi.fn(() => ({ changes: 1 }))
      mockDbUpdate.mockReturnValue({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ run: mockRun }))
        }))
      })

      const result = await markAsRead('notif1', 'user1')
      expect(result).toBe(true)
      expect(notifySseClients).toHaveBeenCalledWith('user1', {
        type: 'read_update',
        notificationId: 'notif1'
      })
    })

    it('returns false when notification not found', async () => {
      const mockRun = vi.fn(() => ({ changes: 0 }))
      mockDbUpdate.mockReturnValue({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ run: mockRun }))
        }))
      })

      const result = await markAsRead('nonexistent', 'user1')
      expect(result).toBe(false)
    })
  })

  describe('markAllAsRead', () => {
    it('marks all as read and returns count', async () => {
      const mockRun = vi.fn(() => ({ changes: 3 }))
      mockDbUpdate.mockReturnValue({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ run: mockRun }))
        }))
      })

      const result = await markAllAsRead('user1')
      expect(result).toBe(3)
      expect(notifySseClients).toHaveBeenCalledWith('user1', { type: 'read_all_update' })
    })

    it('returns 0 when nothing to mark', async () => {
      const mockRun = vi.fn(() => ({ changes: 0 }))
      mockDbUpdate.mockReturnValue({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ run: mockRun }))
        }))
      })

      const result = await markAllAsRead('user1')
      expect(result).toBe(0)
    })
  })
})
