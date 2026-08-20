import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('#server/utils/db', () => ({
  dbGet: vi.fn(),
  dbRun: vi.fn()
}))

vi.mock('#server/database/schema', () => ({
  syncUserSettings: {
    id: 'id',
    userId: 'userId',
    providerName: 'providerName',
    libraryAccess: 'libraryAccess',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args }))
}))

import { dbRun } from '#server/utils/db'
import { createSyncUserSettingsRepo } from '#server/repositories/sync-user-settings'

describe('sync-user-settings repo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dbRun).mockImplementation(async (chain: { run(): { changes?: number } } | PromiseLike<unknown>) => {
      ;(chain as { run(): unknown }).run()
      return { changes: 1 }
    })
  })

  it('upsert() performs an atomic upsert on (userId, providerName)', async () => {
    const onConflictDoUpdate = vi.fn(() => ({ run: vi.fn(() => ({ changes: 1 })) }))
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    const db = {
      insert: vi.fn(() => ({ values })),
      select: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }

    const repo = createSyncUserSettingsRepo(db as never)
    const settings = {
      libraryAccess: 'full',
      enableVideoTranscoding: true,
      enableAudioTranscoding: false,
      enableRemuxing: true,
      enableLiveTvAccess: false,
      enableLiveTvManagement: true,
      maxActiveSessions: 5
    }
    await repo.upsert('user-1', 'jellyfin', settings)

    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(values).toHaveBeenCalledWith({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      userId: 'user-1',
      providerName: 'jellyfin',
      ...settings,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    })
    expect(onConflictDoUpdate).toHaveBeenCalledWith({
      target: ['userId', 'providerName'],
      set: { ...settings, updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }
    })
  })
})
