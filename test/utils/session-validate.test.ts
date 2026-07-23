import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRepos = vi.hoisted(() => ({
  sessions: {
    findById: vi.fn(),
    findUserSessions: vi.fn(),
    touch: vi.fn(),
    delete: vi.fn()
  }
}))

vi.mock('#server/repositories', () => ({
  getReposAsync: vi.fn(() => Promise.resolve(mockRepos))
}))

import { validateSession, touchSession, enforceMaxSessions } from '#server/utils/session-validate'

describe('validateSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when session exists', async () => {
    mockRepos.sessions.findById.mockResolvedValue({ id: 'session-1' })
    const result = await validateSession('session-1')
    expect(result).toBe(true)
  })

  it('returns false when session does not exist', async () => {
    mockRepos.sessions.findById.mockResolvedValue(undefined)
    const result = await validateSession('session-1')
    expect(result).toBe(false)
  })
})

describe('touchSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates lastActiveAt timestamp', async () => {
    await touchSession('session-1')
    expect(mockRepos.sessions.touch).toHaveBeenCalledWith('session-1', expect.any(String))
  })
})

describe('enforceMaxSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when maxSessions is 0 or negative', async () => {
    await enforceMaxSessions('user-1', 0)
    expect(mockRepos.sessions.findUserSessions).not.toHaveBeenCalled()
  })

  it('does nothing when session count is under limit', async () => {
    mockRepos.sessions.findUserSessions.mockResolvedValue([
      { id: 's1', createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 's2', createdAt: '2024-01-02T00:00:00.000Z' }
    ])
    await enforceMaxSessions('user-1', 5)
    expect(mockRepos.sessions.delete).not.toHaveBeenCalled()
  })

  it('deletes oldest sessions when over limit', async () => {
    mockRepos.sessions.findUserSessions.mockResolvedValue([
      { id: 's1', createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 's2', createdAt: '2024-01-02T00:00:00.000Z' },
      { id: 's3', createdAt: '2024-01-03T00:00:00.000Z' }
    ])
    await enforceMaxSessions('user-1', 2)
    expect(mockRepos.sessions.delete).toHaveBeenCalledTimes(1)
  })
})
