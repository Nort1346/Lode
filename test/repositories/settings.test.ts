import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('#server/utils/db', () => ({
  dbGet: vi.fn(),
  dbRun: vi.fn()
}))

vi.mock('#server/database/schema', () => ({
  settings: { key: 'key', value: 'value' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val }))
}))

import { dbRun } from '#server/utils/db'
import { createSettingRepo } from '#server/repositories/settings'

describe('settings repo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dbRun).mockImplementation(async (chain: { run(): { changes?: number } } | PromiseLike<unknown>) => {
      ;(chain as { run(): unknown }).run()
      return { changes: 1 }
    })
  })

  it('set() performs an atomic upsert on the primary key', async () => {
    const onConflictDoUpdate = vi.fn(() => ({ run: vi.fn(() => ({ changes: 1 })) }))
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    const db = {
      insert: vi.fn(() => ({ values })),
      select: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }

    const repo = createSettingRepo(db as never)
    await repo.set('theme', 'dark')

    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(values).toHaveBeenCalledWith({ key: 'theme', value: 'dark' })
    expect(onConflictDoUpdate).toHaveBeenCalledWith({ target: 'key', set: { value: 'dark' } })
  })
})
