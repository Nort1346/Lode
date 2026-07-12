import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubGlobal(
  'useRuntimeConfig',
  vi.fn(() => ({
    public: { vapidPublicKey: 'BN_test_key_123' }
  }))
)

import handler from '#server/api/notifications/vapid-key.get'

describe('notifications/vapid-key.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {} as never

  it('returns vapid public key', async () => {
    const result = await handler(mockEvent)
    expect(result).toEqual({ publicKey: 'BN_test_key_123' })
  })
})
