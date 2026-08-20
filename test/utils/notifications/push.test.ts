import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendNotification = vi.fn()
const mockSetVapidDetails = vi.fn()
const mockFindByUser = vi.hoisted(() => vi.fn())
const mockDelete = vi.hoisted(() => vi.fn())

vi.stubGlobal(
  'useRuntimeConfig',
  vi.fn(() => ({
    public: { vapidPublicKey: 'test-public-key' },
    vapidPrivateKey: 'test-private-key',
    vapidSubject: 'mailto:test@example.com'
  }))
)

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args)
  }
}))

vi.mock('#server/repositories', () => ({
  getReposAsync: vi.fn().mockResolvedValue({
    pushSubscriptions: {
      findByUser: mockFindByUser,
      delete: mockDelete
    }
  })
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() })
}))

function configuredConfig() {
  return {
    public: { vapidPublicKey: 'test-public-key' },
    vapidPrivateKey: 'test-private-key',
    vapidSubject: 'mailto:test@example.com'
  } as never
}

describe('push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  async function loadPush() {
    return await import('#server/utils/notifications/push')
  }

  describe('sendPushNotification', () => {
    it('returns skipped when VAPID is not configured', async () => {
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
      expect(result).toBe('skipped')
    })

    it('returns sent when push succeeds', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue(configuredConfig())
      mockSendNotification.mockResolvedValue(undefined)
      const { sendPushNotification } = await loadPush()
      const result = await sendPushNotification(
        { endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'test' }
      )
      expect(result).toBe('sent')
      expect(mockSendNotification).toHaveBeenCalled()
    })

    it('returns expired on 404', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue(configuredConfig())
      mockSendNotification.mockRejectedValue({ statusCode: 404 })
      const { sendPushNotification } = await loadPush()
      const result = await sendPushNotification(
        { endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'test' }
      )
      expect(result).toBe('expired')
    })

    it('returns expired on 410', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue(configuredConfig())
      mockSendNotification.mockRejectedValue({ statusCode: 410 })
      const { sendPushNotification } = await loadPush()
      const result = await sendPushNotification(
        { endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'test' }
      )
      expect(result).toBe('expired')
    })

    it('returns failed on other errors', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue(configuredConfig())
      mockSendNotification.mockRejectedValue(new Error('network error'))
      const { sendPushNotification } = await loadPush()
      const result = await sendPushNotification(
        { endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: 'a', auth: 'b' } },
        { title: 'test' }
      )
      expect(result).toBe('failed')
    })
  })

  describe('sendPushToUser', () => {
    it('deletes the subscription only when it expired', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue(configuredConfig())
      mockFindByUser.mockResolvedValue([
        { id: 'sub1', endpoint: 'https://fcm.googleapis.com/test', p256dh: 'a', auth: 'b' }
      ])
      mockSendNotification.mockRejectedValue({ statusCode: 404 })

      const { sendPushToUser } = await loadPush()
      await sendPushToUser('user1', { title: 'test' })

      expect(mockDelete).toHaveBeenCalledTimes(1)
      expect(mockDelete).toHaveBeenCalledWith('sub1')
    })

    it('keeps the subscription on transient failures', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue(configuredConfig())
      mockFindByUser.mockResolvedValue([
        { id: 'sub1', endpoint: 'https://fcm.googleapis.com/test', p256dh: 'a', auth: 'b' }
      ])
      mockSendNotification.mockRejectedValue(new Error('network error'))

      const { sendPushToUser } = await loadPush()
      await sendPushToUser('user1', { title: 'test' })

      expect(mockDelete).not.toHaveBeenCalled()
    })

    it('keeps the subscription when VAPID is not configured', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue({
        public: { vapidPublicKey: '' },
        vapidPrivateKey: '',
        vapidSubject: ''
      } as never)
      mockFindByUser.mockResolvedValue([
        { id: 'sub1', endpoint: 'https://fcm.googleapis.com/test', p256dh: 'a', auth: 'b' }
      ])

      const { sendPushToUser } = await loadPush()
      await sendPushToUser('user1', { title: 'test' })

      expect(mockDelete).not.toHaveBeenCalled()
    })

    it('does nothing when the user has no subscriptions', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue(configuredConfig())
      mockFindByUser.mockResolvedValue([])

      const { sendPushToUser } = await loadPush()
      await sendPushToUser('user1', { title: 'test' })

      expect(mockSendNotification).not.toHaveBeenCalled()
      expect(mockDelete).not.toHaveBeenCalled()
    })
  })
})
