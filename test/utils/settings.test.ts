import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSetting, putSetting, deleteSetting } from '#server/utils/settings'

const mockUseDb = vi.hoisted(() => vi.fn())

vi.mock('#server/utils/db', () => ({
  useDb: mockUseDb
}))

vi.mock('#server/database/schema', () => ({
  settings: {
    key: 'key',
    value: 'value'
  }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val }))
}))

describe('settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSetting', () => {
    it('returns setting value when row exists', () => {
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn(() => ({ value: 'test-value' })) })) }))
      }))
      mockUseDb.mockReturnValue({ select: selectMock })

      const result = getSetting('session_password' as never)
      expect(result).toBe('test-value')
    })

    it('returns undefined when row does not exist', () => {
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn(() => undefined) })) }))
      }))
      mockUseDb.mockReturnValue({ select: selectMock })

      const result = getSetting('session_password' as never)
      expect(result).toBeUndefined()
    })
  })

  describe('putSetting', () => {
    it('updates existing setting', () => {
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn(() => ({ key: 'test' })) })) }))
      }))
      const updateMock = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) })) }))
      mockUseDb.mockReturnValue({ select: selectMock, update: updateMock })

      putSetting('session_password' as never, 'new-value')
      expect(updateMock).toHaveBeenCalled()
    })

    it('inserts new setting when it does not exist', () => {
      const selectMock = vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn(() => undefined) })) }))
      }))
      const insertMock = vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) }))
      mockUseDb.mockReturnValue({ select: selectMock, insert: insertMock })

      putSetting('session_password' as never, 'new-value')
      expect(insertMock).toHaveBeenCalled()
    })
  })

  describe('deleteSetting', () => {
    it('deletes setting by key', () => {
      const deleteMock = vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) }))
      mockUseDb.mockReturnValue({ delete: deleteMock })

      deleteSetting('session_password' as never)
      expect(deleteMock).toHaveBeenCalled()
    })
  })
})
