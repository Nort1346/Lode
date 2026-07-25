import { describe, it, expect, vi } from 'vitest'
import { subscribeToNotifications, notifySseClients } from '#server/utils/notifications/sse-hubs'

describe('sse-hubs', () => {
  it('subscribeToNotifications adds callback and returns unsubscribe', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeToNotifications('user1', cb)
    expect(unsubscribe).toBeTypeOf('function')
  })

  it('notifySseClients invokes callback with formatted payload', () => {
    const cb = vi.fn()
    subscribeToNotifications('user2', cb)
    notifySseClients('user2', { type: 'test', value: 42 })
    expect(cb).toHaveBeenCalledWith('data: {"type":"test","value":42}\n\n')
  })

  it('notifySseClients sends to multiple subscribers of same user', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    subscribeToNotifications('user3', cb1)
    subscribeToNotifications('user3', cb2)
    notifySseClients('user3', { msg: 'hi' })
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  it('notifySseClients does nothing when no subscribers', () => {
    expect(() => notifySseClients('nonexistent', {})).not.toThrow()
  })

  it('unsubscribe removes callback', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeToNotifications('user4', cb)
    unsubscribe()
    notifySseClients('user4', {})
    expect(cb).not.toHaveBeenCalled()
  })

  it('unsubscribe cleans up empty sets from map', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeToNotifications('user5', cb)
    unsubscribe()
    expect(() => notifySseClients('user5', {})).not.toThrow()
  })
})
