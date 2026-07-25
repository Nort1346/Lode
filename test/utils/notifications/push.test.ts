import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendNotification = vi.fn()
const mockSetVapidDetails = vi.fn()

vi.stubGlobal(
  'useRuntimeConfig',
  vi.fn(() => ({
    public: { vapidPublicKey: 'test-public-key' },
    vapidPrivateKey: 'test-private-key',
    vapidSubject: 'mailto:test@example.com'
  }))
)

vi.stubGlobal(
  'useDb',
  vi.fn(() => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue([])
        })
      })
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        run: vi.fn()
      })
    })
  }))
)

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args)
  }
}))

vi.mock('#server/database/schema', () => ({
  pushSubscriptions: {
    id: 'id',
    userId: 'userId',
    endpoint: 'endpoint',
    p256dh: 'p256dh',
    auth: 'auth'
  }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val }))
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() })
}))

describe('push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  async function loadPush() {
    return await import('#server/utils/notifications/push')
  }

  describe('sendPushNotification', () => {
    it('returns false when VAPID is not configured', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue({
        public: { vapidPublicKey: '' },
        vapidPrivateKey: '',
        vapidSubject: ''
      } as never)
      const { sendPushNotification } = await loadPush()
      const result = await sendPushNotification(
        { endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'test' }
      )
      expect(result).toBe(false)
    })

    it('returns true when push succeeds', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue({
        public: { vapidPublicKey: 'test-public-key' },
        vapidPrivateKey: 'test-private-key',
        vapidSubject: 'mailto:test@example.com'
      } as never)
      mockSendNotification.mockResolvedValue(undefined)
      const { sendPushNotification } = await loadPush()
      const result = await sendPushNotification(
        { endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'test' }
      )
      expect(result).toBe(true)
      expect(mockSendNotification).toHaveBeenCalled()
    })

    it('returns false on 404 (expired subscription)', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue({
        public: { vapidPublicKey: 'test-public-key' },
        vapidPrivateKey: 'test-private-key',
        vapidSubject: 'mailto:test@example.com'
      } as never)
      mockSendNotification.mockRejectedValue({ statusCode: 404 })
      const { sendPushNotification } = await loadPush()
      const result = await sendPushNotification(
        { endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'test' }
      )
      expect(result).toBe(false)
    })

    it('returns false on 410 (gone subscription)', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue({
        public: { vapidPublicKey: 'test-public-key' },
        vapidPrivateKey: 'test-private-key',
        vapidSubject: 'mailto:test@example.com'
      } as never)
      mockSendNotification.mockRejectedValue({ statusCode: 410 })
      const { sendPushNotification } = await loadPush()
      const result = await sendPushNotification(
        { endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'test' }
      )
      expect(result).toBe(false)
    })

    it('returns false on other errors', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue({
        public: { vapidPublicKey: 'test-public-key' },
        vapidPrivateKey: 'test-private-key',
        vapidSubject: 'mailto:test@example.com'
      } as never)
      mockSendNotification.mockRejectedValue(new Error('network error'))
      const { sendPushNotification } = await loadPush()
      const result = await sendPushNotification(
        { endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'test' }
      )
      expect(result).toBe(false)
    })
  })
})
