import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockCreateSqliteDb = vi.hoisted(() => vi.fn().mockReturnValue({ type: 'sqlite' }))
const mockCreatePostgresDb = vi.hoisted(() => vi.fn().mockResolvedValue({ type: 'postgres' }))

vi.unmock('#server/utils/db')

vi.mock('#server/database/drivers/sqlite', () => ({
  createSqliteDb: mockCreateSqliteDb
}))

vi.mock('#server/database/drivers/postgres', () => ({
  createPostgresDb: mockCreatePostgresDb
}))

const originalDbDriver = process.env.DB_DRIVER

describe('db utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    if (originalDbDriver === undefined) delete process.env.DB_DRIVER
    else process.env.DB_DRIVER = originalDbDriver
  })

  it('creates and caches sqlite db', async () => {
    process.env.DB_DRIVER = 'sqlite'
    const { useDb } = await import('#server/utils/db')

    const db = useDb()
    expect(db).toEqual({ type: 'sqlite' })
    expect(mockCreateSqliteDb).toHaveBeenCalledTimes(1)

    const db2 = useDb()
    expect(db2).toBe(db)
    expect(mockCreateSqliteDb).toHaveBeenCalledTimes(1)
  })

  it('throws for postgres driver', async () => {
    process.env.DB_DRIVER = 'postgres'
    const { useDb } = await import('#server/utils/db')

    expect(() => useDb()).toThrow('PostgreSQL is async')
  })

  it('useDbAsync delegates to useDb for sqlite', async () => {
    process.env.DB_DRIVER = 'sqlite'
    const { useDbAsync } = await import('#server/utils/db')

    const db = await useDbAsync()
    expect(db).toEqual({ type: 'sqlite' })
  })

  it('useDbAsync creates postgres db', async () => {
    process.env.DB_DRIVER = 'postgres'
    const { useDbAsync } = await import('#server/utils/db')

    const db = await useDbAsync()
    expect(db).toEqual({ type: 'postgres' })
    expect(mockCreatePostgresDb).toHaveBeenCalledTimes(1)
  })

  it('useDbAsync caches postgres db', async () => {
    process.env.DB_DRIVER = 'postgres'
    const { useDbAsync } = await import('#server/utils/db')

    const db1 = await useDbAsync()
    const db2 = await useDbAsync()
    expect(db1).toBe(db2)
    expect(mockCreatePostgresDb).toHaveBeenCalledTimes(1)
  })

  it('useDbAsync delegates to useDb when DB_DRIVER unset', async () => {
    delete process.env.DB_DRIVER
    const { useDbAsync } = await import('#server/utils/db')

    const db = await useDbAsync()
    expect(db).toEqual({ type: 'sqlite' })
  })
})

describe('dbRun', () => {
  it('uses the sync run() path for sqlite chains', async () => {
    const { dbRun } = await import('#server/utils/db')
    const result = await dbRun({ run: () => ({ changes: 2 }) })
    expect(result).toEqual({ changes: 2 })
  })

  it('defaults to 0 when sync run() has no changes', async () => {
    const { dbRun } = await import('#server/utils/db')
    const result = await dbRun({ run: () => ({}) })
    expect(result).toEqual({ changes: 0 })
  })

  it('reads postgres.js Result.count on the async path', async () => {
    const { dbRun } = await import('#server/utils/db')
    const result = await dbRun(Promise.resolve({ count: 3 }))
    expect(result).toEqual({ changes: 3 })
  })

  it('defaults to 0 when the async result has no count', async () => {
    const { dbRun } = await import('#server/utils/db')
    const result = await dbRun(Promise.resolve({}))
    expect(result).toEqual({ changes: 0 })
  })
})
