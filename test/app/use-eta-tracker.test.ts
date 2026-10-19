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
// Spec: the UI must NOT show a numeric ETA in the first 12 seconds of a
// download; it must stay in the neutral "collecting" state instead. The
// server-stored `etaSeconds` is never used for display anymore.

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
  it('shows no numeric ETA within the first 12 seconds of a download', () => {
    const registry = createEtaTrackerRegistry()
    for (const tMs of [3_000, 6_000, 10_000]) {
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
    { tMs: 11_999, expected: 'collecting' },
    { tMs: 12_000, expected: 'ready' },
    { tMs: 15_000, expected: 'ready' },
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
})

describe('eta tracker (stable speed)', () => {
  it('collects during warm-up, then shows a stable ETA at stable speed', () => {
    const registry = createEtaTrackerRegistry()
    const steps = [3000, 6000, 9000, 12000, 15000, 18000, 21000].map((t) => ({ t, bytes: fastBytes(t) }))
    const displays = drive(registry, makeDl(), steps)

    // t=3/6/9s: still in the warm-up window even though samples exist
    expect(displays.slice(0, 3).map((d) => d.state)).toEqual(['collecting', 'collecting', 'collecting'])
    // t=12s: warm-up done, 4 valid samples -> first value (~90.4s -> 90)
    expect(displays[3]).toEqual({ state: 'ready', etaSeconds: 90 })
    // t=15/18/21s: estimate drifts < 15% / 60s, hysteresis holds the value
    expect(displays.slice(4, 7).map((d) => d.etaSeconds)).toEqual([90, 90, 90])
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

    // First value at t=12s: (1GiB - 12 MiB) / 1 MiB/s = 1012s
    expect(displays[3]).toEqual({ state: 'ready', etaSeconds: 1012 })
    // Burst and following slow samples must not move the display
    expect(displays.slice(4, 8).map((d) => d.etaSeconds)).toEqual([1012, 1012, 1012, 1012])
    // Sustained 2x speed: median flips at t=27s and the estimate updates
    expect(displays[8]).toEqual({ state: 'ready', etaSeconds: 482 })
    expect(at(displays, 9).etaSeconds).toBe(482)
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

    expect(at(displays, 3).etaSeconds).toBe(90) // t=12s first value
    expect(displays.slice(4, 7).map((d) => d.etaSeconds)).toEqual([90, 90, 90]) // 50% slower, median still 10 MiB/s
    // Median flips to 5 MiB/s at t=27s -> estimate ~160s, change > threshold -> shown
    expect(at(displays, 8).etaSeconds).toBe(160)
    expect(at(displays, 9).etaSeconds).toBe(160)
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
      { t: 36000, bytes: pausedBytes + FAST * 9 }
    ]
    const displays = drive(registry, makeDl(), steps)

    expect(at(displays, 5).state).toBe('ready') // t=18s before pause
    expect(displays[7]).toEqual({ state: 'ready', etaSeconds: 90 }) // t=24s still paused, window frozen
    expect(displays[8]).toEqual({ state: 'calculating', etaSeconds: null }) // t=27s resume poll re-anchors
    expect(at(displays, 9).state).toBe('calculating') // 1 fresh sample
    expect(at(displays, 10).state).toBe('calculating') // 2 fresh samples
    // 3 fresh samples -> fresh estimate (no stale value from before the pause)
    expect(displays[11]).toEqual({ state: 'ready', etaSeconds: 72 })
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
    for (const t of [3000, 6000, 9000, 12000]) {
      registry.trackPoll(
        [
          makeDl({ id: 'dl-fast', downloadedBytes: fastBytes(t) }),
          makeDl({ id: 'dl-slow', downloadedBytes: slowBytes(t) })
        ],
        T0 + t
      )
    }

    expect(registry.displayFor(makeDl({ id: 'dl-fast', downloadedBytes: fastBytes(12000) }), T0 + 12000)).toEqual({
      state: 'ready',
      etaSeconds: 90
    })
    expect(registry.displayFor(makeDl({ id: 'dl-slow', downloadedBytes: slowBytes(12000) }), T0 + 12000)).toEqual({
      state: 'ready',
      etaSeconds: 1012
    })

    // A burst on dl-fast must not affect dl-slow
    registry.trackPoll([makeDl({ id: 'dl-fast', downloadedBytes: fastBytes(12000) + 90 * 1024 * 1024 })], T0 + 15000)
    expect(
      registry.displayFor(makeDl({ id: 'dl-slow', downloadedBytes: slowBytes(15000) }), T0 + 15000).etaSeconds
    ).toBe(1012)
  })

  it('re-anchors after a poll gap larger than the allowed gap', () => {
    const registry = createEtaTrackerRegistry()
    for (const t of [3000, 6000, 9000, 12000]) {
      registry.trackPoll([makeDl({ downloadedBytes: fastBytes(t) })], T0 + t)
    }
    expect(registry.displayFor(makeDl({ downloadedBytes: fastBytes(12000) }), T0 + 12000).state).toBe('ready')

    // 33s without a poll (page switch), then the row comes back
    const gapBytes = fastBytes(45000)
    registry.trackPoll([makeDl({ downloadedBytes: gapBytes })], T0 + 45000)
    expect(registry.displayFor(makeDl({ downloadedBytes: gapBytes }), T0 + 45000)).toEqual({
      state: 'calculating',
      etaSeconds: null
    })

    for (const t of [48000, 51000, 54000]) {
      registry.trackPoll([makeDl({ downloadedBytes: fastBytes(t) })], T0 + t)
    }
    expect(registry.displayFor(makeDl({ downloadedBytes: fastBytes(54000) }), T0 + 54000)).toEqual({
      state: 'ready',
      etaSeconds: 48
    })
  })

  it('re-anchors when the byte counter jumps backwards (no negative samples)', () => {
    const registry = createEtaTrackerRegistry()
    const steps: Step[] = [
      ...[3000, 6000, 9000, 12000, 15000, 18000].map((t) => ({ t, bytes: fastBytes(t) })),
      { t: 21000, bytes: 100_000_000 }, // counter jumped backwards
      { t: 24000, bytes: 100_000_000 + fastBytes(3000) },
      { t: 27000, bytes: 100_000_000 + fastBytes(6000) },
      { t: 30000, bytes: 100_000_000 + fastBytes(9000) }
    ]
    const displays = drive(registry, makeDl(), steps)

    expect(at(displays, 5).state).toBe('ready') // t=18s before the regression
    expect(displays[6]).toEqual({ state: 'calculating', etaSeconds: null }) // t=21s re-anchored
    expect(at(displays, 7).state).toBe('calculating') // 1 fresh sample
    expect(at(displays, 8).state).toBe('calculating') // 2 fresh samples
    expect(displays[9]).toEqual({ state: 'ready', etaSeconds: 84 }) // 3 fresh samples
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

    expect(displays.slice(0, 3).map((d) => d.state)).toEqual(['collecting', 'collecting', 'collecting'])
    for (const d of displays.slice(3)) {
      expect(d).toEqual({ state: 'calculating', etaSeconds: null })
    }
  })

  it('never shows a number when the total size is unknown', () => {
    const registry = createEtaTrackerRegistry()
    const steps = [3000, 6000, 9000, 12000, 15000].map((t) => ({ t, bytes: fastBytes(t), sizeBytes: 0 }))
    const displays = drive(registry, makeDl(), steps)

    expect(displays[3]).toEqual({ state: 'calculating', etaSeconds: null })
    expect(displays[4]).toEqual({ state: 'calculating', etaSeconds: null })
  })

  it('reports waiting-seeders (not a number) for a confirmed zero-seeder stall after warm-up', () => {
    const registry = createEtaTrackerRegistry()
    const steps: Step[] = [3000, 6000, 9000, 12000, 15000].map((t) => ({
      t,
      bytes: 0,
      numSeeds: 0,
      downloadSpeed: 0
    }))
    const displays = drive(registry, makeDl(), steps)

    expect(displays.slice(0, 3).map((d) => d.state)).toEqual(['collecting', 'collecting', 'collecting'])
    expect(displays[3]).toEqual({ state: 'waiting-seeders', etaSeconds: null })
    expect(displays[4]).toEqual({ state: 'waiting-seeders', etaSeconds: null })
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
