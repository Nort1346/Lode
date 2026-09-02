import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkDailyLimit } from '#server/utils/limits'

const mockGetFreshUser = vi.hoisted(() => vi.fn())
const mockCountFiltered = vi.hoisted(() => vi.fn())
const mockCountByUserSince = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/user', () => ({
  getFreshUser: mockGetFreshUser
}))

vi.mock('#server/repositories', () => ({
  getReposAsync: vi.fn().mockResolvedValue({
    downloads: {
      countFiltered: mockCountFiltered,
      countByUserSince: mockCountByUserSince
    }
  })
}))

describe('checkDailyLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns reached: false for non-existent user', async () => {
    mockGetFreshUser.mockResolvedValue(undefined)

    const result = await checkDailyLimit('non-existent')
    expect(result).toEqual({ reached: false, activeCount: 0, todayCount: 0, limit: 0 })
    expect(mockCountFiltered).not.toHaveBeenCalled()
    expect(mockCountByUserSince).not.toHaveBeenCalled()
  })

  it('returns reached: false for admin without counting', async () => {
    mockGetFreshUser.mockResolvedValue({
      id: 'admin1',
      dailyDownloadLimit: 5,
      role: 'admin'
    } as never)

    const result = await checkDailyLimit('admin1')
    expect(result).toEqual({ reached: false, activeCount: 0, todayCount: 0, limit: 5 })
    expect(mockCountFiltered).not.toHaveBeenCalled()
    expect(mockCountByUserSince).not.toHaveBeenCalled()
  })

  it('returns reached: false when under limit', async () => {
    mockGetFreshUser.mockResolvedValue({
      id: 'user1',
      dailyDownloadLimit: 5,
      role: 'user'
    } as never)
    mockCountFiltered.mockResolvedValue(2)
    mockCountByUserSince.mockResolvedValue(2)

    const result = await checkDailyLimit('user1')
    expect(result.reached).toBe(false)
    expect(result.activeCount).toBe(2)
    expect(result.todayCount).toBe(2)
    expect(result.limit).toBe(5)
    expect(mockCountFiltered).toHaveBeenCalledWith({ userId: 'user1', statuses: ['downloading', 'paused'] })
  })

  it('returns reached: true when today count hits limit', async () => {
    mockGetFreshUser.mockResolvedValue({
      id: 'user1',
      dailyDownloadLimit: 2,
      role: 'user'
    } as never)
    mockCountFiltered.mockResolvedValue(2)
    mockCountByUserSince.mockResolvedValue(2)

    const result = await checkDailyLimit('user1')
    expect(result.reached).toBe(true)
  })

  it('does not double-count active downloads toward the daily limit', async () => {
    mockGetFreshUser.mockResolvedValue({
      id: 'user1',
      dailyDownloadLimit: 2,
      role: 'user'
    } as never)
    mockCountFiltered.mockResolvedValue(1)
    mockCountByUserSince.mockResolvedValue(1)

    const result = await checkDailyLimit('user1')
    expect(result.reached).toBe(false)
  })

  it('passes today start and excluded statuses to countByUserSince', async () => {
    mockGetFreshUser.mockResolvedValue({
      id: 'user1',
      dailyDownloadLimit: 5,
      role: 'user'
    } as never)
    mockCountFiltered.mockResolvedValue(0)
    mockCountByUserSince.mockResolvedValue(0)

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    await checkDailyLimit('user1')

    expect(mockCountByUserSince).toHaveBeenCalledWith('user1', todayStart.toISOString(), ['failed', 'removed'])
  })
})
