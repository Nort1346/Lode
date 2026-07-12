import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateSqliteDb = vi.hoisted(() => vi.fn().mockReturnValue({ type: 'sqlite' }))

vi.mock('#server/database/drivers/sqlite', () => ({
  createSqliteDb: mockCreateSqliteDb
}))

describe('db utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('creates and caches sqlite db', async () => {
    vi.stubGlobal('process', { ...process, env: { ...process.env } })
    const { useDb } = await import('#server/utils/db')

    const db = useDb()
    expect(db).toEqual({ type: 'sqlite' })
    expect(mockCreateSqliteDb).toHaveBeenCalledTimes(1)

    const db2 = useDb()
    expect(db2).toBe(db)
    expect(mockCreateSqliteDb).toHaveBeenCalledTimes(1)
  })

  it('throws for postgres driver', async () => {
    vi.stubGlobal('process', { ...process, env: { ...process.env, DB_DRIVER: 'postgres' } })
    const { useDb } = await import('#server/utils/db')

    expect(() => useDb()).toThrow('PostgreSQL is async')
  })
})
