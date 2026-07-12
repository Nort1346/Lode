import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateSqliteDb = vi.hoisted(() => vi.fn().mockReturnValue({ type: 'sqlite' }))
const mockCreatePostgresDb = vi.hoisted(() => vi.fn().mockResolvedValue({ type: 'postgres' }))

vi.mock('#server/database/drivers/sqlite', () => ({
  createSqliteDb: mockCreateSqliteDb
}))

vi.mock('#server/database/drivers/postgres', () => ({
  createPostgresDb: mockCreatePostgresDb
}))

describe('db utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('creates and caches sqlite db', async () => {
    vi.stubGlobal('process', { ...process, env: { ...process.env, DB_DRIVER: 'sqlite' } })
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

  it('useDbAsync delegates to useDb for sqlite', async () => {
    vi.stubGlobal('process', { ...process, env: { ...process.env, DB_DRIVER: 'sqlite' } })
    const { useDbAsync } = await import('#server/utils/db')

    const db = await useDbAsync()
    expect(db).toEqual({ type: 'sqlite' })
  })

  it('useDbAsync creates postgres db', async () => {
    vi.stubGlobal('process', { ...process, env: { ...process.env, DB_DRIVER: 'postgres' } })
    const { useDbAsync } = await import('#server/utils/db')

    const db = await useDbAsync()
    expect(db).toEqual({ type: 'postgres' })
    expect(mockCreatePostgresDb).toHaveBeenCalledTimes(1)
  })

  it('useDbAsync caches postgres db', async () => {
    vi.stubGlobal('process', { ...process, env: { ...process.env, DB_DRIVER: 'postgres' } })
    const { useDbAsync } = await import('#server/utils/db')

    const db1 = await useDbAsync()
    const db2 = await useDbAsync()
    expect(db1).toBe(db2)
    expect(mockCreatePostgresDb).toHaveBeenCalledTimes(1)
  })

  it('useDbAsync delegates to useDb when DB_DRIVER unset', async () => {
    vi.stubGlobal('process', { ...process, env: { ...process.env } })
    delete process.env.DB_DRIVER
    const { useDbAsync } = await import('#server/utils/db')

    const db = await useDbAsync()
    expect(db).toEqual({ type: 'sqlite' })
  })
})
