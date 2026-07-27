import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRepos = vi.hoisted(() => ({
  users: {
    findByRole: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  }
}))

const mockHash = vi.hoisted(() => vi.fn(() => Promise.resolve('hashed-password')))

vi.mock('#server/repositories', () => ({
  getReposAsync: vi.fn(() => Promise.resolve(mockRepos))
}))

vi.mock('@node-rs/bcrypt', () => ({
  hash: mockHash
}))

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid'),
  randomBytes: vi.fn((len: number) => {
    const buf = Buffer.alloc(len)
    for (let i = 0; i < len; i++) buf[i] = 65
    return buf
  })
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn() }))
}))

import { ensureAdminExists } from '#server/utils/seed'

describe('ensureAdminExists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not create admin when one already exists', async () => {
    mockRepos.users.findByRole.mockResolvedValue([{ id: 'admin-1', isActive: true }])
    await ensureAdminExists()
    expect(mockRepos.users.create).not.toHaveBeenCalled()
  })

  it('creates admin when none exists', async () => {
    mockRepos.users.findByRole.mockResolvedValue([])
    await ensureAdminExists()
    expect(mockRepos.users.create).toHaveBeenCalled()
  })

  it('uses bcrypt hash for password', async () => {
    mockRepos.users.findByRole.mockResolvedValue([])
    await ensureAdminExists()
    expect(mockHash).toHaveBeenCalledWith(expect.any(String), 12)
  })

  it('re-activates inactive admin', async () => {
    mockRepos.users.findByRole.mockResolvedValue([{ id: 'admin-1', isActive: false }])
    await ensureAdminExists()
    expect(mockRepos.users.update).toHaveBeenCalledWith('admin-1', { isActive: true })
  })
})
