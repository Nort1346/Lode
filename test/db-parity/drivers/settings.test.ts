import { afterAll, describe, expect, it } from 'vitest'
import { createSettingRepo } from '#server/repositories/settings'
import type { SettingRepo } from '#server/types/repos'
import { canRunForDriver, createFixture, type Fixture } from '../fixtures'

let fixturePromise: Promise<Fixture> | undefined

function getFixture(): Promise<Fixture> {
  fixturePromise ??= createFixture('lode_parity_settings')
  return fixturePromise
}

function repo(fx: Fixture): SettingRepo {
  return createSettingRepo(fx.db)
}

afterAll(async () => {
  if (fixturePromise !== undefined) {
    await (await fixturePromise).close()
  }
})

// The same assertions run on SQLite and on PostgreSQL (see vitest.db-parity.config.ts).
describe.runIf(canRunForDriver())('settings repo parity (upserts)', () => {
  it('inserts, upserts and deletes via ON CONFLICT DO UPDATE', async () => {
    const fx = await getFixture()
    const r = repo(fx)

    await r.set('parity.key', 'v1')
    expect(await r.get('parity.key')).toBe('v1')

    await r.set('parity.key', 'v2')
    expect(await r.get('parity.key')).toBe('v2')

    // exactly one row: the conflict path must update, not insert
    const rows = await fx.query('SELECT key, value FROM settings WHERE key = $1', ['parity.key'])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.value).toBe('v2')

    await r.delete('parity.key')
    expect(await r.get('parity.key')).toBeUndefined()
  })

  it('round-trips unicode and large text values', async () => {
    const fx = await getFixture()
    const r = repo(fx)
    const value = 'x'.repeat(100_000) + ' żółwież 🎬'

    await r.set('parity.big', value)
    expect(await r.get('parity.big')).toBe(value)
  })
})
