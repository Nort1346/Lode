// Shared ETA sampling pipeline. The server owns the registry so every user sees
// the same estimate and a page reload, a second device or a user opening the app
// mid-download does not have to start collecting speed samples from scratch.

// Warm-up window: right after a download starts, speed data is not
// representative yet (metadata fetch, DHT, peer connection setup), so no
// numeric ETA is shown during that time. 20s leaves room for the metadata /
// peer phase plus enough polls to fill a full 5-sample median window, so the
// first displayed value rests on real transfer speed. The window is anchored to
// the server-side createdAt, so opening the page mid-download skips it.
export const ETA_WARMUP_MS = 20_000

// Minimum number of valid (progressing) samples before an ETA is shown. Equal
// to the window size, so the first number always rests on a full window of
// actual progress instead of a partially filled one.
export const ETA_MIN_VALID_SAMPLES = 5

// And a minimum amount of actually observed progress (bytes).
export const ETA_MIN_OBSERVED_BYTES = 5 * 1024 * 1024

// Sliding window of speed samples. The median (not the mean) is used so a
// single burst sample cannot skew the estimate.
export const ETA_SPEED_WINDOW = 5

// The shared registry is fed by the background sync as well as by API reads,
// so several polls can land within the same second. Samples closer together
// than this are ignored - without the throttle, duplicate reads of the same
// qBittorrent snapshot would push zero-delta samples into the median and the
// ETA would flicker to "calculating".
export const ETA_MIN_SAMPLE_INTERVAL_MS = 2_000

// Hysteresis is asymmetric on purpose (countdown UX): a shorter ETA is always
// adopted, so the label ticks down smoothly poll by poll as the download
// progresses. A longer ETA is only adopted when it deviates by more than 15%
// (relative) or 60s (absolute, but capped at 25% of the displayed ETA) from
// the displayed value, which absorbs sampling noise and short dips. The cap
// matters for short ETAs: a flat 60s allowance on a ~1-2 min ETA keeps the
// label frozen at the same value for most of the remaining download, which
// looks like the ETA stopped updating.
export const ETA_HYSTERESIS_REL = 0.15
export const ETA_HYSTERESIS_ABS_SECONDS = 60
export const ETA_HYSTERESIS_ABS_MAX_RATIO = 0.25

// A poll gap larger than this invalidates the speed samples: the tracker
// re-anchors instead of dividing by a stale dt. The background sync is a valid
// poller on its own (it keeps sampling while no user has the page open), so the
// allowance has to cover a slow / raised NUXT_TORRENT_SYNC_INTERVAL_MS - a
// 10s-sized limit would re-anchor on every background tick and the ETA would
// never warm up for a user who opens the page later. Values above this limit
// (5 min) re-anchor on every tick, so the sync interval should stay below it.
export const ETA_MAX_POLL_GAP_MS = 5 * 60_000

// Tracker entries not seen for this long are dropped (pagination, history).
export const ETA_TRACKER_STALE_MS = 10 * 60_000

export const UNRELIABLE_ETA_SECONDS = 48 * 60 * 60

// 'collecting' = the warm-up window is still running (no numeric ETA yet).
export type EtaState = 'collecting' | 'waiting-seeders' | 'calculating' | 'ready'

export interface EtaInput {
  etaSeconds: number
  numSeeds: number
  downloadSpeed: number
}

// What the ETA tracker needs from a download row.
export interface EtaTrackerInput {
  id: string
  status: string
  createdAt: string
  sizeBytes: number
  downloadedBytes: number
  numSeeds: number
  downloadSpeed: number
}

// Result of the ETA display pipeline for one download row.
export interface EtaDisplay {
  state: EtaState
  etaSeconds: number | null
}

// Speed-sampling registry: one EtaTrackerState per active download. The server
// keeps a single instance shared by all users; nothing is persisted.
export interface EtaTrackerRegistry {
  trackPoll(downloads: readonly EtaTrackerInput[], nowMs: number): void
  displayFor(dl: EtaTrackerInput, nowMs: number): EtaDisplay
  size(): number
}

// Per-download speed sampling state.
export interface EtaTrackerState {
  createdAtMs: number | null
  lastBytes: number | null
  lastSampleAt: number | null
  lastStatus: string | null
  // Recent speed samples in bytes/s (0 = no progress during that poll);
  // at most ETA_SPEED_WINDOW entries, oldest first.
  window: number[]
  // Samples with actual progress since the last anchor reset.
  validSamples: number
  // Progress observed (bytes) since the last anchor reset.
  bytesObserved: number
  // Last candidate ETA in seconds that was shown (hysteresis anchor), raw value.
  lastDisplayedEta: number | null
  lastSeenAt: number
}

// Only rows in these states keep a tracker entry / produce speed samples.
const TRACKED_STATUSES = new Set(['downloading', 'paused', 'checking', 'pending'])

function parseCreatedAtMs(createdAt: string): number | null {
  const ms = Date.parse(createdAt)
  return Number.isFinite(ms) ? ms : null
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] as number
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

export function createEtaTrackerState(dl: EtaTrackerInput, nowMs: number): EtaTrackerState {
  return {
    createdAtMs: parseCreatedAtMs(dl.createdAt),
    lastBytes: null,
    lastSampleAt: null,
    lastStatus: null,
    window: [],
    validSamples: 0,
    bytesObserved: 0,
    lastDisplayedEta: null,
    lastSeenAt: nowMs
  }
}

function resetSampling(state: EtaTrackerState, dl: EtaTrackerInput, nowMs: number): void {
  state.lastBytes = dl.downloadedBytes
  state.lastSampleAt = nowMs
  state.window = []
  state.validSamples = 0
  state.bytesObserved = 0
  state.lastDisplayedEta = null
}

export function updateEtaTracker(state: EtaTrackerState, dl: EtaTrackerInput, nowMs: number): void {
  const previousStatus = state.lastStatus
  state.lastStatus = dl.status

  // Only actively downloading rows produce speed samples. Paused/checking
  // rows keep their (frozen) window; completed/failed/removed rows are
  // dropped by the registry.
  if (dl.status !== 'downloading') return

  const lastSampleAt = state.lastSampleAt
  // Overlapping syncs can finish out of order: a snapshot taken earlier must
  // not reset the anchor or overwrite a newer sample.
  if (lastSampleAt !== null && nowMs <= lastSampleAt) return

  const gapTooLarge = lastSampleAt !== null && nowMs - lastSampleAt > ETA_MAX_POLL_GAP_MS
  const bytesRegression = state.lastBytes !== null && dl.downloadedBytes < state.lastBytes
  // A fresh anchor is needed on first sight, after a pause, after a poll
  // gap, or when the byte counter jumped backwards (stale data) - otherwise
  // the next delta would be meaningless.
  if (state.lastBytes === null || previousStatus === 'paused' || gapTooLarge || bytesRegression) {
    resetSampling(state, dl, nowMs)
    return
  }

  if (lastSampleAt === null) return // defensive; the anchor is set in the reset branch above
  const dtMs = nowMs - lastSampleAt
  // Multiple users / the background timer can feed the same snapshot within a
  // second. Skip those reads instead of recording a fake zero-speed sample.
  if (dtMs < ETA_MIN_SAMPLE_INTERVAL_MS) return
  if (dtMs <= 0) return // clock went backwards; skip this poll
  const delta = dl.downloadedBytes - state.lastBytes
  const speed = delta > 0 ? delta / (dtMs / 1000) : 0
  state.window.push(speed)
  if (state.window.length > ETA_SPEED_WINDOW) state.window.shift()
  if (speed > 0) {
    state.validSamples += 1
    state.bytesObserved += delta
  }
  state.lastBytes = dl.downloadedBytes
  state.lastSampleAt = nowMs
}

function applyHysteresis(state: EtaTrackerState, candidate: number): number {
  const last = state.lastDisplayedEta
  if (last === null) {
    state.lastDisplayedEta = candidate
    return candidate
  }
  // Countdown progress: a shorter ETA always flows through.
  if (candidate < last) {
    state.lastDisplayedEta = candidate
    return candidate
  }
  // A longer ETA is only shown once it leaves the hysteresis band. The
  // absolute allowance shrinks with the ETA so short countdowns cannot stall.
  const allowance = Math.max(
    ETA_HYSTERESIS_REL * last,
    Math.min(ETA_HYSTERESIS_ABS_SECONDS, last * ETA_HYSTERESIS_ABS_MAX_RATIO)
  )
  if (candidate - last <= allowance) return last
  state.lastDisplayedEta = candidate
  return candidate
}

// Leaving the ready state ends the current countdown: the hysteresis anchor is
// dropped so a value from before a stall / re-anchor cannot be resurrected
// when a number becomes available again.
function neutral(state: EtaTrackerState | undefined, displayState: EtaState): EtaDisplay {
  if (state !== undefined) state.lastDisplayedEta = null
  return { state: displayState, etaSeconds: null }
}

export function getEtaDisplay(dl: EtaTrackerInput, state: EtaTrackerState | undefined, nowMs: number): EtaDisplay {
  // Only active rows carry an ETA; the rest never show a number.
  if (!TRACKED_STATUSES.has(dl.status)) return neutral(state, 'calculating')

  // No trustworthy start time -> fail open with the neutral state.
  const startedMs = parseCreatedAtMs(dl.createdAt)
  if (startedMs === null) return neutral(state, 'calculating')
  // Warm-up: speed data is not representative yet.
  if (nowMs - startedMs < ETA_WARMUP_MS) return neutral(state, 'collecting')
  // A confirmed zero-seeder swarm with no speed is waiting, not calculating.
  if (dl.numSeeds === 0 && dl.downloadSpeed === 0) return neutral(state, 'waiting-seeders')
  if (state === undefined) return { state: 'calculating', etaSeconds: null }
  // Not enough real progress yet (stalled start, tracker started mid-download).
  if (state.validSamples < ETA_MIN_VALID_SAMPLES || state.bytesObserved < ETA_MIN_OBSERVED_BYTES) {
    return neutral(state, 'calculating')
  }
  // Unknown or fully downloaded size -> no number.
  if (dl.sizeBytes <= 0 || dl.downloadedBytes >= dl.sizeBytes) return neutral(state, 'calculating')
  const speed = median(state.window)
  if (!(speed > 0)) return neutral(state, 'calculating')
  const candidate = (dl.sizeBytes - dl.downloadedBytes) / speed
  if (!Number.isFinite(candidate) || candidate <= 0 || candidate > UNRELIABLE_ETA_SECONDS) {
    return neutral(state, 'calculating')
  }
  return { state: 'ready', etaSeconds: Math.round(applyHysteresis(state, candidate)) }
}

export function createEtaTrackerRegistry(): EtaTrackerRegistry {
  const trackers = new Map<string, EtaTrackerState>()

  return {
    trackPoll(downloads, nowMs) {
      for (const dl of downloads) {
        if (TRACKED_STATUSES.has(dl.status)) {
          let state = trackers.get(dl.id)
          if (state === undefined) {
            state = createEtaTrackerState(dl, nowMs)
            trackers.set(dl.id, state)
          }
          updateEtaTracker(state, dl, nowMs)
          // Only move the stale-sweep clock forward: overlapping polls can
          // finish out of order, and an older snapshot must not make a live
          // entry look stale.
          if (nowMs > state.lastSeenAt) state.lastSeenAt = nowMs
        } else {
          trackers.delete(dl.id)
        }
      }
      trackers.forEach((state, id) => {
        if (nowMs - state.lastSeenAt > ETA_TRACKER_STALE_MS) trackers.delete(id)
      })
    },
    displayFor(dl, nowMs) {
      return getEtaDisplay(dl, trackers.get(dl.id), nowMs)
    },
    size() {
      return trackers.size
    }
  }
}
