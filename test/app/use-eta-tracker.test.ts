import { describe, it, expect, it as vitestIt } from 'vitest'
import { createEtaTrackerRegistry } from '../../app/composables/useEtaTracker'
import type { Download, EtaDisplay, EtaTrackerRegistry } from '../../app/types/downloads'

// Regression: right after a download starts, the UI used to show qBittorrent's
// raw `eta` as stored by the server. qBittorrent computes that ETA as
// "remaining bytes / average of a partially-filled 30-sample speed window",
// and the first seconds of a download are dominated by the slow metadata /
// peer-connection phase, so the stored ETA starts huge and collapses quickly
// (e.g. "2h" at start dropping to "1h 30m" a few seconds later).
//
// Spec: the UI must NOT show a numeric ETA in the first 20 seconds of a
// download; it must stay in the neutral "collecting" state instead. 20s
// leaves room for the slow metadata / peer phase plus a full 5-sample median
// window, built from at least 5 real progress samples. The server-stored
// `etaSeconds` is never used for display.
//
// Hysteresis is asymmetric (countdown UX): a shorter ETA is always adopted
// so the label ticks down smoothly poll by poll, while a longer ETA is only
// adopted when it moves by more than 15% / 60s (noise and short dips are
// absorbed).

const T0 = 1_700_000_000_000
const SIZE = 1024 ** 3 // 1 GiB
const FAST = 10 * 1024 * 1024 // 10 MiB/s
const SLOW = 1024 * 1024 // 1 MiB/s

function makeDl(overrides: Partial<Download> = {}): Download {
  return {
    id: 'dl-1',
    userId: 'user-1',
    label: 'Movie 2024',
    torrentName: 'Movie.2024.2160p.WEB',
    magnetLink: 'magnet:?xt=urn:btih:0000000000000000000000000000000000000000',
    savePath: 'movies',
    status: 'downloading',
    torrentHash: '0000000000000000000000000000000000000000',
    progress: 0,
    etaSeconds: 7200, // the server keeps storing its raw, unreliable ETA
    downloadSpeed: 0,
    uploadSpeed: 0,
    sizeBytes: SIZE,
    downloadedBytes: 0,
    numSeeds: 3,
    numLeechs: 1,
    createdAt: new Date(T0).toISOString(),
    completedAt: null,
    notifiedAt: null,
    posterUrl: null,
    indexerName: null,
    resolution: null,
    organizeStatus: 'pending',
    organizeError: null,
    ...overrides
  }
}

const fastBytes = (tMs: number) => Math.round(FAST * (tMs / 1000))
const slowBytes = (tMs: number) => Math.round(SLOW * (tMs / 1000))

interface Step {
  t: number // ms after T0
  bytes: number
  status?: string
  numSeeds?: number
  downloadSpeed?: number
  sizeBytes?: number
}

// Feeds one row per step into a fresh-registry poll cycle at the given clock
// time and records the display pipeline result for each step.
function drive(registry: EtaTrackerRegistry, base: Download, steps: Step[]): EtaDisplay[] {
  return steps.map((step) => {
    const row: Download = {
      ...base,
      status: step.status ?? 'downloading',
      downloadedBytes: step.bytes,
      numSeeds: step.numSeeds ?? 3,
      downloadSpeed: step.downloadSpeed ?? 0,
      sizeBytes: step.sizeBytes ?? base.sizeBytes
    }
    registry.trackPoll([row], T0 + step.t)
    return registry.displayFor(row, T0 + step.t)
  })
}

// Safe index into a drives() result (the test tsconfig enables noUncheckedIndexedAccess).
function at(displays: EtaDisplay[], index: number): EtaDisplay {
  const display = displays[index]
  if (display === undefined) throw new Error(`missing display at index ${index}`)
  return display
}

describe('early ETA stability (regression)', () => {
  it('shows no numeric ETA within the first 20 seconds of a download', () => {
    const registry = createEtaTrackerRegistry()
    for (const tMs of [3_000, 6_000, 10_000, 13_500, 18_000, 19_500]) {
      const row = makeDl({ downloadedBytes: fastBytes(tMs) })
      registry.trackPoll([row], T0 + tMs)
      const display = registry.displayFor(row, T0 + tMs)
      expect(display.state, `t=${tMs}ms after start`).toBe('collecting')
      expect(display.etaSeconds).toBeNull()
    }
  })

  const warmupTable: Array<{ tMs: number; expected: string }> = [
    { tMs: 1_000, expected: 'collecting' },
    { tMs: 3_000, expected: 'collecting' },
    { tMs: 6_000, expected: 'collecting' },
    { tMs: 9_000, expected: 'collecting' },
    { tMs: 12_000, expected: 'collecting' },
    { tMs: 15_000, expected: 'collecting' },
    { tMs: 18_000, expected: 'collecting' },
    { tMs: 21_000, expected: 'ready' },
    { tMs: 30_000, expected: 'ready' }
  ]

  vitestIt.each(warmupTable)('warm-up boundary: at t=${tMs}ms shows ${expected}', ({ tMs, expected }) => {
    const registry = createEtaTrackerRegistry()
    let last = registry.displayFor(makeDl(), T0 + tMs)
    for (let t = 3000; t <= tMs; t += 3000) {
      const row = makeDl({ downloadedBytes: fastBytes(t) })
      registry.trackPoll([row], T0 + t)
      last = registry.displayFor(row, T0 + t)
    }
    expect(last.state).toBe(expected)
  })

  it('warm-up ends at exactly 20s, checked at render time (not poll time)', () => {
    const registry = createEtaTrackerRegistry()
    for (const t of [3_000, 6_000, 9_000, 12_000, 15_000, 18_000]) {
      registry.trackPoll([makeDl({ downloadedBytes: fastBytes(t) })], T0 + t)
    }
    // The samples and bytes are already there (5 valid samples, 150 MiB
    // observed) but the warm-up window has not passed yet
    expect(registry.displayFor(makeDl({ downloadedBytes: fastBytes(19_999) }), T0 + 19_999).state).toBe('collecting')
    // At the exact boundary the estimate is ready
    expect(registry.displayFor(makeDl({ downloadedBytes: fastBytes(20_000) }), T0 + 20_000).state).toBe('ready')
  })
})

describe('eta tracker (stable speed)', () => {
  it('collects during warm-up, then shows a stable ETA at stable speed', () => {
    const registry = createEtaTrackerRegistry()
    const steps = [3000, 6000, 9000, 12000, 15000, 18000, 21000, 24000, 27000].map((t) => ({
      t,
      bytes: fastBytes(t)
    }))
    const displays = drive(registry, makeDl(), steps)

    // t=3..18s: still in the warm-up window even though samples exist
    expect(displays.slice(0, 6).map((d) => d.state)).toEqual(Array(6).fill('collecting'))
    // t=21s: warm-up done, full 5-sample median -> first value (~81.4s -> 81)
    expect(displays[6]).toEqual({ state: 'ready', etaSeconds: 81 })
    // t=24/27s: countdown progress - a shorter estimate is adopted immediately
    expect(displays.slice(7, 9).map((d) => d.etaSeconds)).toEqual([78, 75])
  })
})

describe('eta tracker (speed changes)', () => {
  it('ignores a single speed burst (false positive) but follows a sustained change', () => {
    const registry = createEtaTrackerRegistry()
    const burst = 30 * 1024 * 1024
    const steps: Step[] = [
      { t: 3000, bytes: slowBytes(3000) },
      { t: 6000, bytes: slowBytes(6000) },
      { t: 9000, bytes: slowBytes(9000) },
      { t: 12000, bytes: slowBytes(12000) },
      { t: 15000, bytes: slowBytes(12000) + burst }, // one 30 MiB/s sample
      { t: 18000, bytes: slowBytes(12000) + burst + SLOW * 3 },
      { t: 21000, bytes: slowBytes(12000) + burst + SLOW * 6 },
      { t: 24000, bytes: slowBytes(12000) + burst + SLOW * 6 + 2 * SLOW * 3 }, // sustained 2x
      { t: 27000, bytes: slowBytes(12000) + burst + SLOW * 6 + 2 * SLOW * 6 },
      { t: 30000, bytes: slowBytes(12000) + burst + SLOW * 6 + 2 * SLOW * 9 }
    ]
    const displays = drive(registry, makeDl(), steps)

    // t=15/18s: still in the 20s warm-up window
    expect(displays[4]).toEqual({ state: 'collecting', etaSeconds: null })
    expect(displays[5]).toEqual({ state: 'collecting', etaSeconds: null })
    // First value at t=21s: (1GiB - 48 MiB) / 1 MiB/s = 976s, burst excluded by the median
    expect(displays[6]).toEqual({ state: 'ready', etaSeconds: 976 })
    // The burst must not spike the estimate: the label only ticks down with countdown progress
    expect(displays.slice(7, 9).map((d) => d.etaSeconds)).toEqual([970, 482])
    // Sustained 2x speed: countdown continues ticking
    expect(at(displays, 9).etaSeconds).toBe(479)
  })

  it('shows no number once the speed drops to zero for several polls (stall)', () => {
    const registry = createEtaTrackerRegistry()
    const stalledAt = fastBytes(21000)
    const steps: Step[] = [
      ...[3000, 6000, 9000, 12000, 15000, 18000].map((t) => ({ t, bytes: fastBytes(t) })),
      { t: 21000, bytes: stalledAt },
      { t: 24000, bytes: stalledAt },
      { t: 27000, bytes: stalledAt },
      { t: 30000, bytes: stalledAt },
      { t: 33000, bytes: stalledAt }
    ]
    const displays = drive(registry, makeDl(), steps)

    expect(at(displays, 6).state).toBe('ready') // t=21s, one flat poll so far
    expect(at(displays, 7).state).toBe('ready') // t=24s, window [10,10,10,10,0] median still > 0
    expect(at(displays, 8).state).toBe('ready') // t=27s, window [10,10,10,0,0] median still > 0
    expect(displays[9]).toEqual({ state: 'calculating', etaSeconds: null }) // t=30s, window [10,10,0,0,0] median 0
    expect(displays[10]).toEqual({ state: 'calculating', etaSeconds: null }) // t=33s, window [10,0,0,0,0] median 0
  })

  it('updates the displayed ETA when the speed change is large enough (hysteresis threshold)', () => {
    const registry = createEtaTrackerRegistry()
    const half = FAST / 2
    const bytesAt18 = fastBytes(18000)
    const steps: Step[] = [
      ...[3000, 6000, 9000, 12000, 15000, 18000].map((t) => ({ t, bytes: fastBytes(t) })),
      { t: 21000, bytes: bytesAt18 + half * 3 },
      { t: 24000, bytes: bytesAt18 + half * 6 },
      { t: 27000, bytes: bytesAt18 + half * 9 },
      { t: 30000, bytes: bytesAt18 + half * 12 }
    ]
    const displays = drive(registry, makeDl(), steps)

    // t=12/15/18s: still in the 20s warm-up window
    expect(at(displays, 3).state).toBe('collecting')
    expect(at(displays, 5).state).toBe('collecting')
    // t=21s first value, then countdown ticks down (shorter estimates always flow through)
    expect(at(displays, 6).etaSeconds).toBe(83)
    expect(at(displays, 7).etaSeconds).toBe(81)
    // Median flips to 5 MiB/s at t=27s -> estimate ~160s, outside the scaled band -> shown
    expect(at(displays, 8).etaSeconds).toBe(160)
    // Countdown continues ticking down after the upward flip
    expect(at(displays, 9).etaSeconds).toBe(157)
  })

  it('absorbs small upward estimate changes (inside the scaled hysteresis band)', () => {
    const registry = createEtaTrackerRegistry()
    const dip = FAST * 0.85 // 8.5 MiB/s
    const bytesAt18 = fastBytes(18000)
    const steps: Step[] = [
      ...[3000, 6000, 9000, 12000, 15000, 18000].map((t) => ({ t, bytes: fastBytes(t) })),
      { t: 21000, bytes: bytesAt18 + dip * 3 },
      { t: 24000, bytes: bytesAt18 + dip * 6 },
      { t: 27000, bytes: bytesAt18 + dip * 9 },
      { t: 30000, bytes: bytesAt18 + dip * 12 }
    ]
    const displays = drive(registry, makeDl(), steps)

    expect(at(displays, 6).etaSeconds).toBe(82)
    expect(at(displays, 7).etaSeconds).toBe(79)
    // t=27s: median flips to 8.5 MiB/s -> candidate ~90s, only ~11s above the
    // displayed value (inside the scaled band) -> the label holds
    expect(at(displays, 8).etaSeconds).toBe(79)
    // t=30s: still inside the band -> held
    expect(at(displays, 9).etaSeconds).toBe(79)
  })

  // Regression: with a flat 60s absolute band, a short ETA (~1m 20s) could
  // stay frozen at the same value for the rest of the download after a speed
  // drop, because the real estimate stayed inside the 60s allowance.
  it('does not freeze a short ETA when the speed drops materially', () => {
    const registry = createEtaTrackerRegistry()
    const dip = FAST * 0.6 // 6 MiB/s
    const bytesAt18 = fastBytes(18000)
    const steps: Step[] = [
      ...[3000, 6000, 9000, 12000, 15000, 18000].map((t) => ({ t, bytes: fastBytes(t) })),
      { t: 21000, bytes: bytesAt18 + dip * 3 },
      { t: 24000, bytes: bytesAt18 + dip * 6 },
      { t: 27000, bytes: bytesAt18 + dip * 9 },
      { t: 30000, bytes: bytesAt18 + dip * 12 }
    ]
    const displays = drive(registry, makeDl(), steps)

    // Median flips to 6 MiB/s at t=27s -> estimate ~132s. The 51s jump is well
    // outside the scaled band for a ~81s ETA, so it is shown immediately.
    expect(at(displays, 8).etaSeconds).toBe(132)
    // The countdown then continues from the corrected value.
    expect(at(displays, 9).etaSeconds).toBe(129)
  })
})

describe('eta tracker (lifecycle)', () => {
  it('pauses sampling while paused and re-measures after resume', () => {
    const registry = createEtaTrackerRegistry()
    const pausedBytes = fastBytes(21000)
    const steps: Step[] = [
      ...[3000, 6000, 9000, 12000, 15000, 18000].map((t) => ({ t, bytes: fastBytes(t) })),
      { t: 21000, bytes: pausedBytes, status: 'paused' },
      { t: 24000, bytes: pausedBytes, status: 'paused' },
      { t: 27000, bytes: pausedBytes }, // resume, no progress yet
      { t: 30000, bytes: pausedBytes + FAST * 3 },
      { t: 33000, bytes: pausedBytes + FAST * 6 },
      { t: 36000, bytes: pausedBytes + FAST * 9 },
      { t: 39000, bytes: pausedBytes + FAST * 12 },
      { t: 42000, bytes: pausedBytes + FAST * 15 }
    ]
    const displays = drive(registry, makeDl(), steps)

    expect(at(displays, 5).state).toBe('collecting') // t=18s, still warming up
    expect(displays[7]).toEqual({ state: 'ready', etaSeconds: 81 }) // t=24s still paused, window frozen
    expect(displays[8]).toEqual({ state: 'calculating', etaSeconds: null }) // t=27s resume poll re-anchors
    expect(at(displays, 9).state).toBe('calculating') // 1 fresh sample
    expect(at(displays, 10).state).toBe('calculating') // 2 fresh samples
    expect(at(displays, 11).state).toBe('calculating') // 3 fresh samples
    expect(at(displays, 12).state).toBe('calculating') // 4 fresh samples
    // 5 fresh samples -> fresh estimate (no stale value from before the pause)
    expect(displays[13]).toEqual({ state: 'ready', etaSeconds: 66 })
  })

  it('restarts the countdown after a stall instead of resurrecting the stale value', () => {
    const registry = createEtaTrackerRegistry()
    const stalledBytes = fastBytes(21000)
    const resume = Math.round(FAST * 0.81)
    const steps: Step[] = [
      ...[3000, 6000, 9000, 12000, 15000, 18000, 21000].map((t) => ({ t, bytes: fastBytes(t) })),
      ...[24000, 27000, 30000, 33000, 36000].map((t) => ({ t, bytes: stalledBytes })),
      { t: 39000, bytes: stalledBytes + resume * 3 },
      { t: 42000, bytes: stalledBytes + resume * 6 },
      { t: 45000, bytes: stalledBytes + resume * 9 }
    ]
    const displays = drive(registry, makeDl(), steps)

    expect(at(displays, 6).etaSeconds).toBe(81) // t=21s before the stall
    expect(at(displays, 9).state).toBe('calculating') // t=30s, median speed 0
    // t=45s: three fresh samples at 8.1 MiB/s -> ~91s. The old 81s value must
    // not survive the stall (it is inside the hysteresis band of the new one).
    expect(at(displays, 14)).toEqual({ state: 'ready', etaSeconds: 91 })
  })

  it('drops the tracker when the download completes during warm-up', () => {
    const registry = createEtaTrackerRegistry()
    registry.trackPoll([makeDl({ downloadedBytes: fastBytes(3000) })], T0 + 3000)
    registry.trackPoll([makeDl({ downloadedBytes: fastBytes(6000) })], T0 + 6000)
    const done = makeDl({ downloadedBytes: SIZE, status: 'completed' })
    registry.trackPoll([done], T0 + 9000)

    expect(registry.size()).toBe(0)
    expect(registry.displayFor(done, T0 + 9000)).toEqual({ state: 'calculating', etaSeconds: null })
  })

  it('drops tracker entries that have not been seen for over two minutes', () => {
    const registry = createEtaTrackerRegistry()
    const oldDl = makeDl({ id: 'dl-old', downloadedBytes: fastBytes(3000) })
    registry.trackPoll([oldDl], T0 + 3000)
    expect(registry.size()).toBe(1)

    const freshDl = makeDl({ id: 'dl-new', createdAt: new Date(T0 + 130_000).toISOString() })
    registry.trackPoll([freshDl], T0 + 133_000)

    expect(registry.size()).toBe(1) // dl-old swept, dl-new kept
    expect(registry.displayFor(oldDl, T0 + 133_000)).toEqual({ state: 'calculating', etaSeconds: null })
  })

  it('tracks concurrent downloads independently', () => {
    const registry = createEtaTrackerRegistry()
    for (const t of [3000, 6000, 9000, 12000, 15000, 18000, 21000]) {
      registry.trackPoll(
        [
          makeDl({ id: 'dl-fast', downloadedBytes: fastBytes(t) }),
          makeDl({ id: 'dl-slow', downloadedBytes: slowBytes(t) })
        ],
        T0 + t
      )
    }

    expect(registry.displayFor(makeDl({ id: 'dl-fast', downloadedBytes: fastBytes(21000) }), T0 + 21000)).toEqual({
      state: 'ready',
      etaSeconds: 81
    })
    expect(registry.displayFor(makeDl({ id: 'dl-slow', downloadedBytes: slowBytes(21000) }), T0 + 21000)).toEqual({
      state: 'ready',
      etaSeconds: 1003
    })

    // A burst on dl-fast must not affect dl-slow
    registry.trackPoll([makeDl({ id: 'dl-fast', downloadedBytes: fastBytes(21000) + 90 * 1024 * 1024 })], T0 + 24000)
    expect(
      registry.displayFor(makeDl({ id: 'dl-slow', downloadedBytes: slowBytes(24000) }), T0 + 24000).etaSeconds
    ).toBe(1000)
  })

  it('re-anchors after a poll gap larger than the allowed gap', () => {
    const registry = createEtaTrackerRegistry()
    for (const t of [3000, 6000, 9000, 12000, 15000]) {
      registry.trackPoll([makeDl({ downloadedBytes: fastBytes(t) })], T0 + t)
    }
    // t=15s: still in the 20s warm-up window
    expect(registry.displayFor(makeDl({ downloadedBytes: fastBytes(15000) }), T0 + 15000).state).toBe('collecting')

    // 30s without a poll (page switch), then the row comes back
    const gapBytes = fastBytes(45000)
    registry.trackPoll([makeDl({ downloadedBytes: gapBytes })], T0 + 45000)
    expect(registry.displayFor(makeDl({ downloadedBytes: gapBytes }), T0 + 45000)).toEqual({
      state: 'calculating',
      etaSeconds: null
    })

    for (const t of [48000, 51000, 54000, 57000, 60000]) {
      registry.trackPoll([makeDl({ downloadedBytes: fastBytes(t) })], T0 + t)
    }
    expect(registry.displayFor(makeDl({ downloadedBytes: fastBytes(60000) }), T0 + 60000)).toEqual({
      state: 'ready',
      etaSeconds: 42
    })
  })

  it('re-anchors when the byte counter jumps backwards (no negative samples)', () => {
    const registry = createEtaTrackerRegistry()
    const backBytes = 100_000_000
    const steps: Step[] = [
      ...[3000, 6000, 9000, 12000, 15000, 18000].map((t) => ({ t, bytes: fastBytes(t) })),
      { t: 21000, bytes: backBytes }, // counter jumped backwards
      { t: 24000, bytes: backBytes + fastBytes(3000) },
      { t: 27000, bytes: backBytes + fastBytes(6000) },
      { t: 30000, bytes: backBytes + fastBytes(9000) },
      { t: 33000, bytes: backBytes + fastBytes(12000) },
      { t: 36000, bytes: backBytes + fastBytes(15000) }
    ]
    const displays = drive(registry, makeDl(), steps)

    expect(at(displays, 5).state).toBe('collecting') // t=18s, still warming up
    expect(displays[6]).toEqual({ state: 'calculating', etaSeconds: null }) // t=21s re-anchored
    // Four fresh samples are still below the 5-sample minimum
    expect(displays.slice(7, 11).map((d) => d.state)).toEqual(Array(4).fill('calculating'))
    // 5 fresh samples -> first fresh estimate
    expect(displays[11]).toEqual({ state: 'ready', etaSeconds: 78 })
  })
})

describe('eta tracker (false positives and error paths)', () => {
  it('shows no number for a stalled start even when the server row claims speed', () => {
    const registry = createEtaTrackerRegistry()
    const steps: Step[] = [3000, 6000, 9000, 12000, 15000, 21000].map((t) => ({
      t,
      bytes: 0,
      numSeeds: 3,
      downloadSpeed: 400_000 // the server row claims an active speed
    }))
    const displays = drive(registry, makeDl(), steps)

    expect(displays.slice(0, 5).map((d) => d.state)).toEqual(Array(5).fill('collecting'))
    for (const d of displays.slice(5)) {
      expect(d).toEqual({ state: 'calculating', etaSeconds: null })
    }
  })

  it('never shows a number when the total size is unknown', () => {
    const registry = createEtaTrackerRegistry()
    const steps = [3000, 6000, 9000, 12000, 15000, 21000].map((t) => ({ t, bytes: fastBytes(t), sizeBytes: 0 }))
    const displays = drive(registry, makeDl(), steps)

    expect(displays[4]).toEqual({ state: 'collecting', etaSeconds: null }) // t=15s still warming up
    expect(displays[5]).toEqual({ state: 'calculating', etaSeconds: null }) // t=21s, unknown size
  })

  it('reports waiting-seeders (not a number) for a confirmed zero-seeder stall after warm-up', () => {
    const registry = createEtaTrackerRegistry()
    const steps: Step[] = [3000, 6000, 9000, 12000, 15000, 21000].map((t) => ({
      t,
      bytes: 0,
      numSeeds: 0,
      downloadSpeed: 0
    }))
    const displays = drive(registry, makeDl(), steps)

    expect(displays.slice(0, 5).map((d) => d.state)).toEqual(Array(5).fill('collecting'))
    expect(displays[5]).toEqual({ state: 'waiting-seeders', etaSeconds: null })
  })

  it('never shows an absurd ETA (48h cap) for a tiny speed on a huge file', () => {
    const registry = createEtaTrackerRegistry()
    const bigSize = 50 * 1024 ** 3
    const tinySpeed = 10_000 // 10 KiB/s
    const steps: Step[] = []
    for (let t = 30_000; t <= 600_000; t += 30_000) {
      steps.push({ t, bytes: Math.round(tinySpeed * (t / 1000)), sizeBytes: bigSize })
    }
    const displays = drive(registry, makeDl({ sizeBytes: bigSize }), steps)

    // ~5.3M seconds remaining estimate -> capped, so no number is shown
    expect(displays[displays.length - 1]).toEqual({ state: 'calculating', etaSeconds: null })
  })

  it('fails open to the neutral state when createdAt is unparseable', () => {
    const registry = createEtaTrackerRegistry()
    const dl = makeDl({ createdAt: 'not-a-date' })
    registry.trackPoll([dl], T0 + 3000)
    registry.trackPoll([dl], T0 + 6000)

    expect(registry.displayFor(dl, T0 + 12000)).toEqual({ state: 'calculating', etaSeconds: null })
  })
})
