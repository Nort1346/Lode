import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRepos = vi.hoisted(() => ({
  users: {
    findByRole: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  }
}))

const mockHash = vi.hoisted(() => vi.fn(() => Promise.resolve('hashed-password')))

const mockLog = vi.hoisted(() => ({ info: vi.fn() }))

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
  createLogger: vi.fn(() => mockLog)
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

  it('marks the seeded admin as must-change-password', async () => {
    mockRepos.users.findByRole.mockResolvedValue([])
    await ensureAdminExists()
    expect(mockRepos.users.create).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'admin', mustChangePassword: true })
    )
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

  it('logs the temp password on first run', async () => {
    mockRepos.users.findByRole.mockResolvedValue([])
    await ensureAdminExists()
    const calls = mockLog.info.mock.calls.map((args) => args.join(' '))
    expect(calls.some((line) => line.startsWith('Admin password: '))).toBe(true)
    expect(calls).toContain('Change this password after first login!')
  })

  it('regenerates the temp password on restart when the bootstrap admin never changed it', async () => {
    mockRepos.users.findByRole.mockResolvedValue([
      { id: 'admin-1', username: 'admin', isActive: true, mustChangePassword: true }
    ])
    await ensureAdminExists()
    expect(mockHash).toHaveBeenCalledWith(expect.any(String), 12)
    expect(mockRepos.users.update).toHaveBeenCalledWith('admin-1', { password: 'hashed-password' })
    const calls = mockLog.info.mock.calls.map((args) => args.join(' '))
    expect(calls.some((line) => line.startsWith('Admin password: '))).toBe(true)
    expect(mockRepos.users.create).not.toHaveBeenCalled()
  })

  it('does not regenerate the password once the bootstrap admin changed it', async () => {
    mockRepos.users.findByRole.mockResolvedValue([
      { id: 'admin-1', username: 'admin', isActive: true, mustChangePassword: false }
    ])
    await ensureAdminExists()
    expect(mockHash).not.toHaveBeenCalled()
    expect(mockRepos.users.update).not.toHaveBeenCalled()
    expect(mockLog.info).not.toHaveBeenCalled()
  })

  it('leaves non-bootstrap users with the must-change flag untouched', async () => {
    mockRepos.users.findByRole.mockResolvedValue([
      { id: 'other-1', username: 'otheradmin', isActive: true, mustChangePassword: true }
    ])
    await ensureAdminExists()
    expect(mockHash).not.toHaveBeenCalled()
    expect(mockRepos.users.update).not.toHaveBeenCalled()
    expect(mockLog.info).not.toHaveBeenCalled()
  })
})
