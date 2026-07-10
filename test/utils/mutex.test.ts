import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withTorrentAddLock, checkCooldown, setCooldown } from '#server/utils/mutex'

const delayedResolve = <T>(value: T, ms: number): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms))

describe('withTorrentAddLock', () => {
  it('runs function when not locked', async () => {
    const result = await withTorrentAddLock(async () => 'done')
    expect(result).toBe('done')
  })

  it('queues concurrent calls', async () => {
    const order: number[] = []
    const p1 = withTorrentAddLock(async () => {
      order.push(1)
      await delayedResolve(null, 50)
    })
    const p2 = withTorrentAddLock(async () => {
      order.push(2)
    })
    await Promise.all([p1, p2])
    expect(order).toEqual([1, 2])
  })

  it('handles rejection without deadlocking', async () => {
    const p1 = withTorrentAddLock(async () => {
      throw new Error('fail')
    }).catch(() => 'caught')
    const p2 = withTorrentAddLock(async () => 'ok')
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe('caught')
    expect(r2).toBe('ok')
  })

  it('runs many concurrent calls in order', async () => {
    const order: number[] = []
    const promises = Array.from({ length: 5 }, (_, i) =>
      withTorrentAddLock(async () => {
        await delayedResolve(null, Math.random() * 20)
        order.push(i)
      })
    )
    await Promise.all(promises)
    expect(order).toEqual([0, 1, 2, 3, 4])
  })
})

describe('checkCooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns ok=true when no cooldown set', () => {
    const result = checkCooldown('user-1')
    expect(result.ok).toBe(true)
    expect(result.remainingMs).toBe(0)
  })

  it('returns ok=false when cooldown is active', () => {
    setCooldown('user-1')
    const result = checkCooldown('user-1')
    expect(result.ok).toBe(false)
    expect(result.remainingMs).toBeGreaterThan(0)
    expect(result.remainingMs).toBeLessThanOrEqual(5000)
  })

  it('returns ok=true after cooldown expires', () => {
    setCooldown('user-1')
    vi.advanceTimersByTime(5000)
    const result = checkCooldown('user-1')
    expect(result.ok).toBe(true)
    expect(result.remainingMs).toBe(0)
  })

  it('tracks different users independently', () => {
    setCooldown('user-1')
    expect(checkCooldown('user-1').ok).toBe(false)
    expect(checkCooldown('user-2').ok).toBe(true)
  })
})
