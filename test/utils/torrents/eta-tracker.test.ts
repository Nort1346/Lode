import { beforeEach, describe, expect, it } from 'vitest'
import { applyServerEta, resetServerEtaTracker, serverEtaFor, trackServerEta } from '#server/utils/torrents/eta-tracker'
import type { EtaTrackerInput } from '#shared/eta-tracker'

const T0 = 1_700_000_000_000
const SIZE = 1024 ** 3 // 1 GiB
const FAST = 10 * 1024 * 1024 // 10 MiB/s

function makeRow(overrides: Partial<EtaTrackerInput> = {}): EtaTrackerInput {
  return {
    id: 'dl-1',
    status: 'downloading',
    sizeBytes: SIZE,
    downloadedBytes: 0,
    numSeeds: 3,
    downloadSpeed: FAST,
    createdAt: new Date(T0).toISOString(),
    ...overrides
  }
}

const fastBytes = (tMs: number) => Math.round(FAST * (tMs / 1000))

describe('server ETA tracker', () => {
  beforeEach(() => {
    resetServerEtaTracker()
  })

  it('shares one warmed-up ETA between all users instead of recalculating per session', () => {
    for (const t of [3000, 6000, 9000, 12000, 15000, 18000, 21000]) {
      trackServerEta([makeRow({ downloadedBytes: fastBytes(t) })], T0 + t)
    }

    const row = makeRow({ downloadedBytes: fastBytes(21000) })

    // First caller (a fresh page load) gets the already warmed-up value.
    expect(applyServerEta(row, T0 + 21000)).toMatchObject({ etaState: 'ready', etaSeconds: 81 })
    // A second caller reads the same shared state without feeding new samples.
    expect(serverEtaFor(row, T0 + 21000)).toEqual({ state: 'ready', etaSeconds: 81 })

    const later = makeRow({ downloadedBytes: fastBytes(24000) })
    trackServerEta([later], T0 + 24000)
    expect(applyServerEta(later, T0 + 24000).etaSeconds).toBe(78)
  })

  it('does not let concurrent API reads pollute the speed window', () => {
    for (const t of [3000, 6000, 9000, 12000, 15000, 18000]) {
      trackServerEta([makeRow({ downloadedBytes: fastBytes(t) })], T0 + t)
    }

    // Ten reads of the same snapshot (different users polling at once) land
    // inside the throttle window and must be skipped.
    for (let i = 0; i < 10; i++) {
      trackServerEta([makeRow({ downloadedBytes: fastBytes(18000) })], T0 + 18_000 + i * 100)
    }

    const row = makeRow({ downloadedBytes: fastBytes(21000) })
    trackServerEta([row], T0 + 21000)

    expect(applyServerEta(row, T0 + 21000)).toMatchObject({ etaState: 'ready', etaSeconds: 81 })
  })

  it('keeps the warm-up state while a download is young', () => {
    trackServerEta([makeRow({ downloadedBytes: fastBytes(3000) })], T0 + 3000)

    expect(applyServerEta(makeRow({ downloadedBytes: fastBytes(3000) }), T0 + 3000)).toMatchObject({
      etaState: 'collecting',
      etaSeconds: 0
    })
  })

  it('zeroes the raw stored ETA for rows without an active estimate', () => {
    const completed = {
      ...makeRow({ status: 'completed', downloadedBytes: SIZE }),
      // Raw qBittorrent value as stored by the sync.
      etaSeconds: 7200
    }

    expect(applyServerEta(completed, T0 + 60_000)).toMatchObject({
      etaState: 'calculating',
      etaSeconds: 0
    })
  })
})
