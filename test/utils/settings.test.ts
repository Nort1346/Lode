import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRepos = vi.hoisted(() => ({
  settings: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  }
}))

vi.mock('#server/repositories', () => ({
  getReposAsync: vi.fn(() => Promise.resolve(mockRepos))
}))

import { getSetting, putSetting, deleteSetting } from '#server/utils/settings'

describe('settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSetting', () => {
    it('returns setting value when row exists', async () => {
      mockRepos.settings.get.mockResolvedValue('test-value')
      const result = await getSetting('session_password' as never)
      expect(result).toBe('test-value')
    })

    it('returns undefined when row does not exist', async () => {
      mockRepos.settings.get.mockResolvedValue(undefined)
      const result = await getSetting('session_password' as never)
      expect(result).toBeUndefined()
    })
  })

  describe('putSetting', () => {
    it('updates existing setting', async () => {
      await putSetting('session_password' as never, 'new-value')
      expect(mockRepos.settings.set).toHaveBeenCalledWith('session_password', 'new-value')
    })
  })

  describe('deleteSetting', () => {
    it('deletes setting by key', async () => {
      await deleteSetting('session_password' as never)
      expect(mockRepos.settings.delete).toHaveBeenCalledWith('session_password')
    })
  })
})
