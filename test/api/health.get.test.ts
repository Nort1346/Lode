import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUseRuntimeConfig = vi.fn()
const mockUseDbAsync = vi.fn()
const mockDbGet = vi.fn()

vi.stubGlobal('useRuntimeConfig', mockUseRuntimeConfig)
vi.stubGlobal('useDbAsync', mockUseDbAsync)
vi.stubGlobal('dbGet', mockDbGet)

import handler from '#server/api/health.get'

const fakeDb = { select: () => ({ from: () => ({ limit: () => ({}) }) }) }
const mockEvent = {} as never

describe('health.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRuntimeConfig.mockReturnValue({ public: { appVersion: '1.2.3' } })
  })

  it('reports healthy when the database check succeeds', async () => {
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDbGet.mockResolvedValue([])

    await expect(handler(mockEvent)).resolves.toEqual({ status: 'healthy', database: 'ok', version: '1.2.3' })
    expect(mockDbGet).toHaveBeenCalledTimes(1)
  })

  it('reports degraded when the database check throws', async () => {
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDbGet.mockRejectedValue(new Error('db down'))

    await expect(handler(mockEvent)).resolves.toEqual({ status: 'degraded', database: 'error', version: '1.2.3' })
  })

  it('reports degraded when no database connection is available', async () => {
    mockUseDbAsync.mockRejectedValue(new Error('no db'))

    await expect(handler(mockEvent)).resolves.toEqual({ status: 'degraded', database: 'error', version: '1.2.3' })
  })

  it('falls back to an unknown version when it is not configured', async () => {
    mockUseRuntimeConfig.mockReturnValue({ public: {} })
    mockUseDbAsync.mockResolvedValue(fakeDb)
    mockDbGet.mockResolvedValue([])

    await expect(handler(mockEvent)).resolves.toEqual({ status: 'healthy', database: 'ok', version: 'unknown' })
  })
})
