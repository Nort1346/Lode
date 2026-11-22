import { describe, expect, it } from 'vitest'
import { getTableName } from 'drizzle-orm'
import * as appSchema from '#server/database/schema'
import { createPostgresFixture, createSqliteFixture, pgTestUrl, type Fixture } from '../fixtures'

type TableMap = Record<string, string[]>

async function introspect(fx: Fixture): Promise<TableMap> {
  const tables = await (fx.kind === 'sqlite'
    ? fx.query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'"
      )
    : fx.query(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '__drizzle_migrations'"
      ))

  const out: TableMap = {}
  for (const row of tables) {
    const name = String(row.name)
    const columns = await (fx.kind === 'sqlite'
      ? fx.query(`PRAGMA table_info(${name})`)
      : fx.query(
          'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2',
          ['public', name]
        ))
    out[name] = columns.map((c) => String(c.name)).sort()
  }
  return out
}

// Runs on both real databases in the same process - catches drift between the
// two independently generated migration chains (server/database/migrations vs
// server/database/migrations/postgres).
describe.runIf(pgTestUrl() !== undefined)('schema parity: SQLite vs PostgreSQL migration chains', () => {
  it('both migration chains produce the same tables and columns', async () => {
    const sqliteFx = createSqliteFixture()
    const pgFx = await createPostgresFixture('lode_parity_schema')
    try {
      const sqliteTables = await introspect(sqliteFx)
      const pgTables = await introspect(pgFx)

      const sqliteNames = Object.keys(sqliteTables).sort()
      const pgNames = Object.keys(pgTables).sort()
      expect(pgNames).toEqual(sqliteNames)

      // (the set of table names is asserted equal above, so both maps hold every name)
      for (const table of sqliteNames) {
        expect(pgTables[table]?.sort(), `columns of table ${table}`).toEqual(sqliteTables[table]?.sort())
      }

      // every table the app schema references must exist in both chains
      const appTables = (Object.keys(appSchema) as Array<keyof typeof appSchema>)
        .map((key) => getTableName(appSchema[key]))
        .sort()
      expect(appTables.length).toBeGreaterThan(0)
      for (const table of appTables) {
        expect(sqliteNames, `sqlite chain is missing table ${table}`).toContain(table)
        expect(pgNames, `postgres chain is missing table ${table}`).toContain(table)
      }
    } finally {
      sqliteFx.close()
      await pgFx.close()
    }
  })
})
