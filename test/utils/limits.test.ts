import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkDailyLimit } from '#server/utils/limits'
import { getFreshUser } from '#server/utils/user'

const mockDbAll = vi.hoisted(() => vi.fn())
const mockUseDbAsync = vi.hoisted(() => vi.fn())

vi.mock('#server/database/schema', () => ({
  downloads: {
    userId: 'userId',
    status: 'status',
    createdAt: 'createdAt'
  }
}))

vi.mock('#server/utils/user', () => ({
  getFreshUser: vi.fn()
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args) => args),
  eq: vi.fn((col, val) => ({ col, val }))
}))

vi.mock('#server/utils/db', () => ({
  useDbAsync: mockUseDbAsync,
  dbAll: mockDbAll
}))

describe('checkDailyLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns reached: false for non-existent user', async () => {
    vi.mocked(getFreshUser).mockResolvedValue(undefined)

    const result = await checkDailyLimit('non-existent')
    expect(result).toEqual({ reached: false, activeCount: 0, todayCount: 0, limit: 0 })
  })

  it('returns reached: false when under limit', async () => {
    vi.mocked(getFreshUser).mockResolvedValue({
      id: 'user1',
      dailyDownloadLimit: 5,
      role: 'user'
    } as never)

    const mockChain = {}
    const mockSelect = vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => mockChain) })) }))
    mockUseDbAsync.mockResolvedValue({ select: mockSelect })
    mockDbAll.mockResolvedValue([{ id: '1' }, { id: '2' }])

    const result = await checkDailyLimit('user1')
    expect(result.reached).toBe(false)
    expect(result.activeCount).toBe(2)
  })

  it('returns reached: true when at limit', async () => {
    vi.mocked(getFreshUser).mockResolvedValue({
      id: 'user1',
      dailyDownloadLimit: 2,
      role: 'user'
    } as never)

    const mockChain = {}
    const mockSelect = vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => mockChain) })) }))
    mockUseDbAsync.mockResolvedValue({ select: mockSelect })
    mockDbAll.mockResolvedValue([{ id: '1' }, { id: '2' }, { id: '3' }])

    const result = await checkDailyLimit('user1')
    expect(result.reached).toBe(true)
    expect(result.activeCount).toBe(3)
  })
})
