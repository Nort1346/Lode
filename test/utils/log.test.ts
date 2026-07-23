import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { H3Event } from 'h3'

const mockUseDbAsync = vi.hoisted(() => vi.fn())
const mockDbRun = vi.hoisted(() => vi.fn())
const mockInsert = vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) }))

vi.mock('#server/utils/db', () => ({
  useDbAsync: mockUseDbAsync,
  dbRun: mockDbRun
}))

vi.mock('#server/database/schema', () => ({
  activityLogs: {
    id: 'id',
    userId: 'userId',
    username: 'username',
    action: 'action',
    details: 'details',
    ip: 'ip',
    userAgent: 'userAgent',
    createdAt: 'createdAt'
  }
}))

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid')
}))

vi.mock('h3', () => ({
  getHeader: vi.fn(() => 'Mozilla/5.0 TestBrowser')
}))

const mockResolveIp = vi.hoisted(() => vi.fn(() => '192.168.1.1'))

vi.mock('#server/utils/ip', () => ({
  resolveIp: mockResolveIp
}))

import { logActivity } from '#server/utils/log'

describe('logActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDbAsync.mockResolvedValue({ insert: mockInsert })
    mockDbRun.mockResolvedValue({ changes: 1 })
  })

  it('inserts activity log with provided fields', async () => {
    const event = {} as unknown as H3Event
    await logActivity(event, { action: 'test_action', userId: 'user-1', username: 'testuser', details: 'some details' })

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'id', userId: 'userId' }))
  })

  it('uses null for optional fields when not provided', async () => {
    const event = {} as unknown as H3Event
    await logActivity(event, { action: 'test_action' })

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'id' }))
  })

  it('resolves IP address', async () => {
    const event = {} as unknown as H3Event
    await logActivity(event, { action: 'login' })
    expect(mockResolveIp).toHaveBeenCalledWith(event)
  })
})
