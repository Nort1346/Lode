import { afterAll, describe, expect, it } from 'vitest'
import { createSyncUserSettingsRepo } from '#server/repositories/sync-user-settings'
import type { SyncUserSettingsRecord } from '#server/types/entities'
import type { SyncUserSettingsRepo } from '#server/types/repos'
import { canRunForDriver, createFixture, type Fixture } from '../fixtures'

let fixturePromise: Promise<Fixture> | undefined

function getFixture(): Promise<Fixture> {
  fixturePromise ??= createFixture('lode_parity_sync')
  return fixturePromise
}

function repo(fx: Fixture): SyncUserSettingsRepo {
  return createSyncUserSettingsRepo(fx.db)
}

function fullSettings(
  overrides: Partial<Omit<SyncUserSettingsRecord, 'id' | 'userId' | 'providerName' | 'createdAt' | 'updatedAt'>> = {}
) {
  return {
    libraryAccess: 'all',
    enableVideoTranscoding: true,
    enableAudioTranscoding: false,
    enableRemuxing: true,
    enableLiveTvAccess: true,
    enableLiveTvManagement: false,
    maxActiveSessions: 2,
    ...overrides
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

afterAll(async () => {
  if (fixturePromise !== undefined) {
    await (await fixturePromise).close()
  }
})

// The same assertions run on SQLite and on PostgreSQL (see vitest.db-parity.config.ts).
describe.runIf(canRunForDriver())('sync user settings repo parity (composite upsert)', () => {
  it('upserts on the composite unique index without duplicating rows', async () => {
    const fx = await getFixture()
    const r = repo(fx)

    await r.upsert('u-up', 'jellyfin', fullSettings())
    const first = await r.find('u-up', 'jellyfin')
    expect(first).toBeDefined()
    expect(first?.enableAudioTranscoding).toBe(false)
    expect(first?.maxActiveSessions).toBe(2)
    expect(first?.libraryAccess).toBe('all')

    // updatedAt is wall-clock time with ms resolution - make the second upsert strictly later
    await sleep(20)
    await r.upsert('u-up', 'jellyfin', fullSettings({ enableAudioTranscoding: true }))

    // exactly one row: ON CONFLICT (user_id, provider_name) must hit the unique index
    const rows = await fx.query('SELECT id FROM sync_user_settings WHERE user_id = $1 AND provider_name = $2', [
      'u-up',
      'jellyfin'
    ])
    expect(rows).toHaveLength(1)

    const second = await r.find('u-up', 'jellyfin')
    expect(second?.enableAudioTranscoding).toBe(true)
    expect(second?.id).toBe(first?.id)
    // updatedAt is an ISO-8601 string - compare as instants
    expect(new Date(second?.updatedAt ?? '').getTime()).toBeGreaterThan(new Date(first?.updatedAt ?? '').getTime())
  })

  it('keeps providers independent for the same user', async () => {
    const fx = await getFixture()
    const r = repo(fx)

    await r.upsert('u-up2', 'jellyfin', fullSettings({ maxActiveSessions: 1 }))
    await r.upsert('u-up2', 'plex', fullSettings({ maxActiveSessions: 5 }))

    expect((await r.find('u-up2', 'jellyfin'))?.maxActiveSessions).toBe(1)
    expect((await r.find('u-up2', 'plex'))?.maxActiveSessions).toBe(5)
  })
})
