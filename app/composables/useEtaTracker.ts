import { useI18n } from 'vue-i18n'

import { UNRELIABLE_ETA_SECONDS, formatEta } from './useTorrentUtils'
import type { EtaDisplay, EtaState, EtaTrackerInput, EtaTrackerRegistry, EtaTrackerState } from '~/types/downloads'

// Warm-up window: right after a download starts, speed data is not
// representative yet (metadata fetch, DHT, peer connection setup), so no
// numeric ETA is shown during that time. 14s spans five 3s poll cycles, so
// the first displayed value rests on a full 5-sample median window. The
// window is anchored to the server-side createdAt, so opening the page
// mid-download skips it.
export const ETA_WARMUP_MS = 14_000

// Minimum number of valid (progressing) samples before an ETA is shown, so a
// stalled start cannot produce a bogus value.
export const ETA_MIN_VALID_SAMPLES = 3

// And a minimum amount of actually observed progress (bytes).
export const ETA_MIN_OBSERVED_BYTES = 2 * 1024 * 1024

// Sliding window of speed samples (3s polls -> ~15s). The median (not the
// mean) is used so a single burst sample cannot skew the estimate.
export const ETA_SPEED_WINDOW = 5

// Hysteresis is asymmetric on purpose (countdown UX): a shorter ETA is always
// adopted, so the label ticks down smoothly poll by poll as the download
// progresses. A longer ETA is only adopted when it deviates by more than 15%
// (relative) or 60s (absolute) from the displayed value, which absorbs
// sampling noise and short dips. Real sustained slowdowns always exceed the
// band once the median settles, so they are never masked for long.
export const ETA_HYSTERESIS_REL = 0.15
export const ETA_HYSTERESIS_ABS_SECONDS = 60

// A poll gap (page switch, slow network) larger than this invalidates the
// speed samples: the tracker re-anchors instead of dividing by a stale dt.
export const ETA_MAX_POLL_GAP_MS = 10_000

// Tracker entries not seen for this long are dropped (pagination, history).
export const ETA_TRACKER_STALE_MS = 2 * 60_000

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

  const gapTooLarge = state.lastSampleAt !== null && nowMs - state.lastSampleAt > ETA_MAX_POLL_GAP_MS
  const bytesRegression = state.lastBytes !== null && dl.downloadedBytes < state.lastBytes
  // A fresh anchor is needed on first sight, after a pause, after a poll
  // gap, or when the byte counter jumped backwards (stale data) - otherwise
  // the next delta would be meaningless.
  if (state.lastBytes === null || previousStatus === 'paused' || gapTooLarge || bytesRegression) {
    resetSampling(state, dl, nowMs)
    return
  }

  const lastSampleAt = state.lastSampleAt
  if (lastSampleAt === null) return // defensive; the anchor is set in the reset branch above
  const dtMs = nowMs - lastSampleAt
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
  // A longer ETA is only shown once it leaves the hysteresis band.
  if (candidate - last <= Math.max(ETA_HYSTERESIS_REL * last, ETA_HYSTERESIS_ABS_SECONDS)) return last
  state.lastDisplayedEta = candidate
  return candidate
}

export function getEtaDisplay(dl: EtaTrackerInput, state: EtaTrackerState | undefined, nowMs: number): EtaDisplay {
  // Only active rows carry an ETA; the rest never show a number.
  if (!TRACKED_STATUSES.has(dl.status)) return { state: 'calculating', etaSeconds: null }

  // No trustworthy start time -> fail open with the neutral state.
  const startedMs = parseCreatedAtMs(dl.createdAt)
  if (startedMs === null) return { state: 'calculating', etaSeconds: null }
  // Warm-up: speed data is not representative yet.
  if (nowMs - startedMs < ETA_WARMUP_MS) return { state: 'collecting', etaSeconds: null }
  // A confirmed zero-seeder swarm with no speed is waiting, not calculating.
  if (dl.numSeeds === 0 && dl.downloadSpeed === 0) return { state: 'waiting-seeders', etaSeconds: null }
  if (state === undefined) return { state: 'calculating', etaSeconds: null }
  // Not enough real progress yet (stalled start, page opened mid-download).
  if (state.validSamples < ETA_MIN_VALID_SAMPLES || state.bytesObserved < ETA_MIN_OBSERVED_BYTES) {
    return { state: 'calculating', etaSeconds: null }
  }
  // Unknown or fully downloaded size -> no number.
  if (dl.sizeBytes <= 0 || dl.downloadedBytes >= dl.sizeBytes) return { state: 'calculating', etaSeconds: null }
  const speed = median(state.window)
  if (!(speed > 0)) return { state: 'calculating', etaSeconds: null }
  const candidate = (dl.sizeBytes - dl.downloadedBytes) / speed
  if (!Number.isFinite(candidate) || candidate <= 0 || candidate > UNRELIABLE_ETA_SECONDS) {
    return { state: 'calculating', etaSeconds: null }
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
          state.lastSeenAt = nowMs
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

// Module-level singleton shared by all dashboard pages: the warm-up state of a
// download must survive navigating between them within one session. In-memory
// only - nothing is persisted, a page reload simply re-warms up.
let defaultRegistry: EtaTrackerRegistry | null = null

function getDefaultRegistry(): EtaTrackerRegistry {
  if (defaultRegistry === null) defaultRegistry = createEtaTrackerRegistry()
  return defaultRegistry
}

export function resetEtaTracker(): void {
  defaultRegistry = null
}

export function useEtaTracker() {
  const { t } = useI18n()
  const registry = getDefaultRegistry()

  function trackPoll(downloads: readonly EtaTrackerInput[], nowMs: number = Date.now()): void {
    registry.trackPoll(downloads, nowMs)
  }

  function displayFor(dl: EtaTrackerInput, nowMs: number = Date.now()): EtaDisplay {
    return registry.displayFor(dl, nowMs)
  }

  function etaState(dl: EtaTrackerInput, nowMs: number = Date.now()): EtaState {
    return registry.displayFor(dl, nowMs).state
  }

  function etaLabel(dl: EtaTrackerInput, nowMs: number = Date.now()): string {
    const display = registry.displayFor(dl, nowMs)
    if (display.state === 'ready') return formatEta(display.etaSeconds ?? 0)
    if (display.state === 'waiting-seeders') return t('dashboard.etaWaitingSeeders')
    return t('dashboard.etaCalculating')
  }

  return { trackPoll, displayFor, etaState, etaLabel }
}
