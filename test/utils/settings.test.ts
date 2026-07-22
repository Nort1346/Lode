import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUseDbAsync = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#server/utils/db')>()
  return {
    ...actual,
    useDbAsync: mockUseDbAsync
  }
})

vi.mock('#server/database/schema', () => ({
  settings: {
    key: 'key',
    value: 'value'
  }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val }))
}))

import { getSetting, putSetting, deleteSetting } from '#server/utils/settings'

function createMockDb(overrides: { getReturnValue?: unknown; runReturnValue?: unknown } = {}) {
  const selectChain = {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        get: vi.fn(() => overrides.getReturnValue)
      }))
    }))
  }
  const updateChain = {
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        run: vi.fn(() => overrides.runReturnValue ?? { changes: 1 })
      }))
    }))
  }
  const insertChain = {
    values: vi.fn(() => ({
      run: vi.fn(() => overrides.runReturnValue ?? { changes: 1 })
    }))
  }
  const deleteChain = {
    where: vi.fn(() => ({
      run: vi.fn(() => overrides.runReturnValue ?? { changes: 1 })
    }))
  }
  return {
    select: Object.assign(
      vi.fn(() => selectChain),
      { _chain: selectChain }
    ),
    update: Object.assign(
      vi.fn(() => updateChain),
      { _chain: updateChain }
    ),
    insert: Object.assign(
      vi.fn(() => insertChain),
      { _chain: insertChain }
    ),
    delete: Object.assign(
      vi.fn(() => deleteChain),
      { _chain: deleteChain }
    )
  }
}

describe('settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSetting', () => {
    it('returns setting value when row exists', async () => {
      mockUseDbAsync.mockResolvedValue(createMockDb({ getReturnValue: { value: 'test-value' } }))

      const result = await getSetting('session_password' as never)
      expect(result).toBe('test-value')
    })

    it('returns undefined when row does not exist', async () => {
      mockUseDbAsync.mockResolvedValue(createMockDb({ getReturnValue: undefined }))

      const result = await getSetting('session_password' as never)
      expect(result).toBeUndefined()
    })
  })

  describe('putSetting', () => {
    it('updates existing setting', async () => {
      const db = createMockDb({ getReturnValue: { key: 'test' } })
      mockUseDbAsync.mockResolvedValue(db)

      await putSetting('session_password' as never, 'new-value')
      expect(db.update).toHaveBeenCalled()
    })

    it('inserts new setting when it does not exist', async () => {
      const db = createMockDb({ getReturnValue: undefined })
      mockUseDbAsync.mockResolvedValue(db)

      await putSetting('session_password' as never, 'new-value')
      expect(db.insert).toHaveBeenCalled()
    })
  })

  describe('deleteSetting', () => {
    it('deletes setting by key', async () => {
      const db = createMockDb()
      mockUseDbAsync.mockResolvedValue(db)

      await deleteSetting('session_password' as never)
      expect(db.delete).toHaveBeenCalled()
    })
  })
})
