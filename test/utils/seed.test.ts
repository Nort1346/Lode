import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUseDb = vi.hoisted(() => vi.fn())
const mockInsert = vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) }))
const mockGet = vi.fn()
const mockWhere = vi.fn(() => ({ get: mockGet }))
const mockFrom = vi.fn(() => ({ where: mockWhere }))
const mockSelect = vi.fn(() => ({ from: mockFrom }))
const mockHash = vi.hoisted(() => vi.fn(() => Promise.resolve('hashed-password')))

vi.mock('#server/utils/db', () => ({
  useDb: mockUseDb
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn() }))
}))

vi.mock('#server/database/schema', () => ({
  users: {
    id: 'id',
    username: 'username',
    role: 'role',
    isActive: 'isActive',
    password: 'password'
  }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val }))
}))

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid')
}))

vi.mock('@node-rs/bcrypt', () => ({
  hash: mockHash
}))

import { ensureAdminExists } from '#server/utils/seed'

describe('ensureAdminExists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDb.mockReturnValue({ select: mockSelect, insert: mockInsert })
  })

  it('does not create admin when one already exists', async () => {
    mockGet.mockReturnValue({ id: 'admin-1' })
    await ensureAdminExists()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('creates admin when none exists', async () => {
    mockGet.mockReturnValue(undefined)
    await ensureAdminExists()
    expect(mockInsert).toHaveBeenCalled()
  })

  it('uses bcrypt hash for password', async () => {
    mockGet.mockReturnValue(undefined)
    await ensureAdminExists()
    expect(mockHash).toHaveBeenCalledWith('admin', 12)
  })
})
