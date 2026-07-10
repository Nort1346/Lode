import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getFreshUser } from '#server/utils/user'
import { useDb } from '#server/utils/db'

vi.mock('#server/utils/db', () => ({
  useDb: vi.fn()
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

describe('getFreshUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns user when found', () => {
    const mockUser = { id: 'user-1', username: 'testuser', role: 'user' }
    const getMock = vi.fn(() => mockUser)
    const whereMock = vi.fn(() => ({ get: getMock }))
    const fromMock = vi.fn(() => ({ where: whereMock }))
    const selectMock = vi.fn(() => ({ from: fromMock }))
    vi.mocked(useDb).mockReturnValue({ select: selectMock } as never)

    const result = getFreshUser('user-1')
    expect(result).toEqual(mockUser)
    expect(selectMock).toHaveBeenCalled()
    expect(fromMock).toHaveBeenCalled()
    expect(whereMock).toHaveBeenCalled()
  })

  it('returns undefined when user not found', () => {
    const getMock = vi.fn(() => undefined)
    const whereMock = vi.fn(() => ({ get: getMock }))
    const fromMock = vi.fn(() => ({ where: whereMock }))
    const selectMock = vi.fn(() => ({ from: fromMock }))
    vi.mocked(useDb).mockReturnValue({ select: selectMock } as never)

    const result = getFreshUser('non-existent')
    expect(result).toBeUndefined()
  })
})
