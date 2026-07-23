import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUseDbAsync = vi.hoisted(() => vi.fn())
const mockDbGet = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/db', () => ({
  useDbAsync: mockUseDbAsync,
  dbGet: mockDbGet
}))

vi.mock('#server/database/schema', () => ({
  users: {
    id: 'id',
    username: 'username',
    role: 'role'
  }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val }))
}))

import { getFreshUser } from '#server/utils/user'

describe('getFreshUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns user when found', async () => {
    const mockUser = { id: 'user-1', username: 'testuser', role: 'user' }
    const mockChain = {}
    const mockSelect = vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => mockChain) })) }))
    mockUseDbAsync.mockResolvedValue({ select: mockSelect })
    mockDbGet.mockResolvedValue(mockUser)

    const result = await getFreshUser('user-1')
    expect(result).toEqual(mockUser)
    expect(mockDbGet).toHaveBeenCalledWith(mockChain)
  })

  it('returns undefined when user not found', async () => {
    const mockChain = {}
    const mockSelect = vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => mockChain) })) }))
    mockUseDbAsync.mockResolvedValue({ select: mockSelect })
    mockDbGet.mockResolvedValue(undefined)

    const result = await getFreshUser('non-existent')
    expect(result).toBeUndefined()
  })
})
