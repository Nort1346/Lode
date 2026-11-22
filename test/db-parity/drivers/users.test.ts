import { afterAll, describe, expect, it } from 'vitest'
import { createUserRepo } from '#server/repositories/users'
import type { UserRepo } from '#server/types/repos'
import { canRunForDriver, createFixture, type Fixture } from '../fixtures'

let fixturePromise: Promise<Fixture> | undefined

function getFixture(): Promise<Fixture> {
  fixturePromise ??= createFixture('lode_parity_users')
  return fixturePromise
}

function repo(fx: Fixture): UserRepo {
  return createUserRepo(fx.db)
}

afterAll(async () => {
  if (fixturePromise !== undefined) {
    await (await fixturePromise).close()
  }
})

// The same assertions run on SQLite and on PostgreSQL (see vitest.db-parity.config.ts).
describe.runIf(canRunForDriver())('users repo parity (booleans, case, expiry)', () => {
  it('round-trips booleans and text-enum defaults', async () => {
    const fx = await getFixture()
    const r = repo(fx)
    await r.create({
      id: 'u-bool',
      username: 'Boolie',
      password: 'pw',
      createdAt: '2026-11-22T00:00:00.000Z'
    })

    const user = await r.findById('u-bool')
    // SQLite stores booleans as 0/1 integers, PostgreSQL as native booleans
    expect(user?.isActive).toBe(true)
    expect(user?.canSubmit).toBe(false)
    expect(user?.mustChangePassword).toBe(false)
    expect(user?.role).toBe('user')
    expect(user?.syncStatus).toBe('synced')
    expect(user?.dailyDownloadLimit).toBe(5)

    await r.update('u-bool', { isActive: false, canSubmit: true, role: 'admin' })
    const updated = await r.findById('u-bool')
    expect(updated?.isActive).toBe(false)
    expect(updated?.canSubmit).toBe(true)
    expect(updated?.role).toBe('admin')
  })

  it('username lookups are case-sensitive', async () => {
    const fx = await getFixture()
    const r = repo(fx)
    await r.create({
      id: 'u-case',
      username: 'CaseSensi',
      password: 'pw',
      createdAt: '2026-11-22T00:00:00.000Z'
    })

    expect(await r.findByUsername('CaseSensi')).toBeDefined()
    expect(await r.findByUsername('casesensi')).toBeUndefined()
    expect(await r.findByUsername('CASESENSI')).toBeUndefined()
  })

  it('findExpiredUsers compares ISO text timestamps (lte)', async () => {
    const fx = await getFixture()
    const r = repo(fx)
    const createdAt = '2026-11-22T00:00:00.000Z'

    await r.create({
      id: 'u-exp-1',
      username: 'ExpiredOne',
      password: 'pw',
      createdAt,
      expiresAt: '2026-01-01T00:00:00.000Z'
    })
    await r.create({
      id: 'u-exp-2',
      username: 'StillValid',
      password: 'pw',
      createdAt,
      expiresAt: '2999-01-01T00:00:00.000Z'
    })
    await r.create({ id: 'u-exp-3', username: 'NoExpiry', password: 'pw', createdAt })

    const expired = await r.findExpiredUsers('2026-11-22T12:00:00.000Z')
    expect(expired.map((e) => e.id)).toEqual(['u-exp-1'])
  })
})
