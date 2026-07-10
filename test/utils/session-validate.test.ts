import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUseDb = vi.hoisted(() => vi.fn())
const mockSelect = vi.fn()
const mockAll = vi.fn()
const mockGet = vi.fn()
const mockWhere = vi.fn(() => ({ get: mockGet, run: vi.fn(), all: mockAll }))
const mockDeleteWhere = vi.fn(() => ({ run: vi.fn() }))
const mockFrom = vi.fn(() => ({ where: mockWhere }))
const mockUpdate = vi.fn(() => ({ set: vi.fn(() => ({ where: mockWhere })) }))

vi.mock('#server/utils/db', () => ({
  useDb: mockUseDb
}))

vi.mock('#server/database/schema', () => ({
  sessions: {
    id: 'id',
    userId: 'userId',
    createdAt: 'createdAt',
    lastActiveAt: 'lastActiveAt'
  }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val }))
}))

import { validateSession, touchSession, enforceMaxSessions } from '#server/utils/session-validate'

describe('validateSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDb.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ from: mockFrom })
    mockWhere.mockReturnValue({ get: mockGet, run: vi.fn(), all: mockAll })
  })

  it('returns true when session exists', async () => {
    mockGet.mockReturnValue({ id: 'session-1' })
    const result = await validateSession('session-1')
    expect(result).toBe(true)
  })

  it('returns false when session does not exist', async () => {
    mockGet.mockReturnValue(undefined)
    const result = await validateSession('session-1')
    expect(result).toBe(false)
  })
})

describe('touchSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDb.mockReturnValue({ update: mockUpdate })
  })

  it('updates lastActiveAt timestamp', async () => {
    mockWhere.mockReturnValue({ get: mockGet, run: vi.fn(), all: mockAll })
    await touchSession('session-1')
    expect(mockUpdate).toHaveBeenCalled()
  })
})

describe('enforceMaxSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))
    mockUseDb.mockReturnValue({ select: mockSelect, delete: mockDelete })
    mockSelect.mockReturnValue({ from: mockFrom })
    mockWhere.mockReturnValue({ get: mockGet, run: vi.fn(), all: mockAll })
  })

  it('does nothing when maxSessions is 0 or negative', async () => {
    await enforceMaxSessions('user-1', 0)
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('does nothing when session count is under limit', async () => {
    mockAll.mockReturnValue([
      { id: 's1', createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 's2', createdAt: '2024-01-02T00:00:00.000Z' }
    ])
    await enforceMaxSessions('user-1', 5)
    expect(mockDeleteWhere).not.toHaveBeenCalled()
  })

  it('deletes oldest sessions when over limit', async () => {
    mockAll.mockReturnValue([
      { id: 's1', createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 's2', createdAt: '2024-01-02T00:00:00.000Z' },
      { id: 's3', createdAt: '2024-01-03T00:00:00.000Z' }
    ])
    await enforceMaxSessions('user-1', 2)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
  })
})
