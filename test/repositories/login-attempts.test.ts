import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('#server/utils/db', () => ({
  dbGet: vi.fn(),
  dbRun: vi.fn()
}))

vi.mock('#server/database/schema', () => ({
  loginAttempts: { ip: 'ip', success: 'success', createdAt: 'createdAt' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  gt: vi.fn((col: unknown, val: unknown) => ({ op: 'gt', col, val })),
  lt: vi.fn((col: unknown, val: unknown) => ({ op: 'lt', col, val })),
  count: vi.fn(() => 'cnt')
}))

import { dbGet, dbRun } from '#server/utils/db'
import { gt, lt } from 'drizzle-orm'
import { createLoginAttemptRepo } from '#server/repositories/login-attempts'

function createRepo() {
  const get = vi.fn(() => ({ cnt: 1 }))
  const run = vi.fn(() => ({ changes: 1 }))
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get }))
      }))
    })),
    delete: vi.fn(() => ({
      where: vi.fn((cond: unknown) => ({ cond, run }))
    }))
  }
  return { repo: createLoginAttemptRepo(db as never), db, get, run }
}

describe('login-attempts repo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dbGet).mockImplementation(async (chain: { get(): unknown } | PromiseLike<unknown>) =>
      (chain as { get(): unknown }).get()
    )
    vi.mocked(dbRun).mockImplementation(async (chain: { run(): { changes?: number } } | PromiseLike<unknown>) => {
      ;(chain as { run(): unknown }).run()
      return { changes: 1 }
    })
  })

  describe('deleteOlderThan', () => {
    it('deletes rows older than the cutoff using lt', async () => {
      const { repo, db, run } = createRepo()
      await repo.deleteOlderThan('2026-08-13T12:00:00.000Z')

      expect(db.delete).toHaveBeenCalledTimes(1)
      expect(vi.mocked(lt)).toHaveBeenCalledWith('createdAt', '2026-08-13T12:00:00.000Z')
      expect(run).toHaveBeenCalledTimes(1)
    })
  })

  describe('countFailedInWindow', () => {
    it('counts failures in the window using gt', async () => {
      const { repo } = createRepo()
      const cnt = await repo.countFailedInWindow('1.2.3.4', '2026-08-20T00:00:00.000Z')

      expect(cnt).toBe(1)
      expect(vi.mocked(gt)).toHaveBeenCalledWith('createdAt', '2026-08-20T00:00:00.000Z')
      expect(vi.mocked(lt)).not.toHaveBeenCalled()
    })
  })
})
