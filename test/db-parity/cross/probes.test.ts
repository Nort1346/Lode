import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { count } from 'drizzle-orm'
import * as pgSchema from '#server/database/schema.pg'
import * as sqliteSchema from '#server/database/schema.sqlite'
import type { PgDb } from '#server/types/database'
import { createPostgresFixture, createSqliteFixture, pgTestUrl, type Fixture } from '../fixtures'

let fixtures: { sqlite: Fixture; pg: Fixture } | undefined

beforeAll(async () => {
  fixtures = { sqlite: createSqliteFixture(), pg: await createPostgresFixture('lode_parity_probes') }
})

afterAll(async () => {
  if (fixtures !== undefined) {
    fixtures.sqlite.close()
    await fixtures.pg.close()
  }
})

function fx(): { sqlite: Fixture; pg: Fixture } {
  if (fixtures === undefined) throw new Error('fixtures not initialized')
  return fixtures
}

async function withBoth<T>(fn: (fx: Fixture) => Promise<T>): Promise<[T, T]> {
  const { sqlite, pg } = fx()
  const a = await fn(sqlite)
  const b = await fn(pg)
  return [a, b]
}

// The repositories always query through drizzle with the schema table objects
// of the active driver - mirror that here (the shared schema module resolves
// to a single driver per process, so pick the table object per fixture).
async function drizzleCount(fx: Fixture): Promise<unknown> {
  if (fx.kind === 'postgres') {
    const rows = await (fx.db as unknown as PgDb).select({ c: count() }).from(pgSchema.settings)
    return rows[0]?.c
  }
  const rows = await fx.db.select({ c: count() }).from(sqliteSchema.settings)
  return rows[0]?.c
}

// These probes pin DOWN the known dialect differences with executable
// assertions. They pass while the differences remain as documented; if a
// PG/SQLite release changes one of these behaviors, the suite goes red.
// The app code must not rely on any behavior that differs below.
describe.runIf(pgTestUrl() !== undefined)('dialect probes (documented differences)', () => {
  it('NULL ordering in DESC: SQLite NULLS LAST, PostgreSQL NULLS FIRST', async () => {
    const [sqliteOrder, pgOrder] = await withBoth(async (fx) => {
      await fx.exec('CREATE TABLE probe_null_order (v text)')
      await fx.exec("INSERT INTO probe_null_order (v) VALUES (NULL), ('b')")
      const rows = await fx.query('SELECT v FROM probe_null_order ORDER BY v DESC')
      return rows.map((r) => (r.v === null || r.v === undefined ? null : String(r.v)))
    })

    // SQLite: NULL is less than any value -> last in DESC
    expect(sqliteOrder).toEqual(['b', null])
    // PostgreSQL: NULL sorts as greater than any value -> first in DESC
    expect(pgOrder).toEqual([null, 'b'])
  })

  it('LIKE is ASCII case-insensitive on SQLite but case-sensitive on PostgreSQL (C collation)', async () => {
    const [sqliteHits, pgHits] = await withBoth(async (fx) => {
      // pin the C collation so the PG result does not depend on the server locale
      await fx.exec(
        fx.kind === 'postgres' ? 'CREATE TABLE probe_like (v text COLLATE "C")' : 'CREATE TABLE probe_like (v text)'
      )
      await fx.exec("INSERT INTO probe_like (v) VALUES ('abc')")
      const rows = await fx.query("SELECT count(*) AS c FROM probe_like WHERE v LIKE 'ABC'")
      return Number(rows[0]?.c ?? 0)
    })

    expect(sqliteHits).toBe(1)
    expect(pgHits).toBe(0)
  })

  it('REAL precision: SQLite float64 vs PostgreSQL float4', async () => {
    // 9 significant digits: float64 round-trips it exactly, float4 (~7 significant
    // digits) must round it - the rounded value cannot print back as the same decimal
    const exact = 0.123456789
    const [sqliteValue, pgValue] = await withBoth(async (fx) => {
      await fx.exec('CREATE TABLE probe_float (v real)')
      await fx.exec(`INSERT INTO probe_float (v) VALUES (${exact})`)
      const rows = await fx.query('SELECT v FROM probe_float')
      return Number(rows[0]?.v ?? 0)
    })

    // SQLite REAL is an 8-byte IEEE double -> exact round-trip
    expect(sqliteValue).toBe(exact)
    // PostgreSQL real is a 4-byte float (6-7 significant digits) -> rounded
    expect(pgValue).not.toBe(exact)
    expect(pgValue).toBeCloseTo(exact, 5)
  })

  it('integer width: SQLite INT is 64-bit, PostgreSQL integer is 32-bit', async () => {
    const { sqlite, pg } = fx()
    await sqlite.exec('CREATE TABLE probe_int (v integer)')
    await pg.exec('CREATE TABLE probe_int (v integer)')

    // 3_000_000_000 > int4 max (2_147_483_647)
    await sqlite.exec('INSERT INTO probe_int (v) VALUES (3000000000)')
    await expect(pg.exec('INSERT INTO probe_int (v) VALUES (3000000000)')).rejects.toThrow(/out of range/i)
  })

  it('boolean storage differs at the wire level (0/1 vs t/f)', async () => {
    const [sqliteRaw, pgRaw] = await withBoth(async (fx) => {
      // TRUE literal: accepted by both (SQLite knows TRUE/FALSE since 3.23, PG
      // is strict about binding integers into boolean columns)
      await fx.exec(
        "INSERT INTO downloads (id, user_id, magnet_link, save_path, is_private, created_at) VALUES ('dl-bool-probe', 'u-probe', 'magnet:?xt=urn:btih:probe', 'movies', TRUE, '2026-11-22T00:00:00.000Z')"
      )
      const rows = await fx.query('SELECT is_private FROM downloads WHERE id = $1', ['dl-bool-probe'])
      return rows[0]?.is_private
    })

    // raw representations differ (drizzle normalizes to JS booleans - covered
    // by the driver parity tests that run on both real databases)
    expect(sqliteRaw).toBe(1)
    expect(pgRaw).toBe(true)
  })

  it('drizzle-typed count(*) is a number on both drivers (raw int8 is a string on PG)', async () => {
    const [sqliteCount, pgCount] = await withBoth(drizzleCount)

    // the app's data path: drizzle-typed queries normalize int8 to numbers
    expect(typeof sqliteCount).toBe('number')
    expect(typeof pgCount).toBe('number')

    // raw postgres-js reads of int8 stay strings - future code must not read
    // counts or bigints through raw/unsafe queries without conversion
    const rawRows = await fx().pg.query('SELECT count(*) AS c FROM settings')
    expect(typeof rawRows[0]?.c).toBe('string')
  })
})
