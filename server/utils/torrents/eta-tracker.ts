import {
  createEtaTrackerRegistry,
  type EtaDisplay,
  type EtaState,
  type EtaTrackerInput,
  type EtaTrackerRegistry
} from '#shared/eta-tracker'

// One registry per server process, not per user: every API read and every
// background sync feeds the same sample window, so all users see the same
// already warmed-up ETA instead of each browser collecting its own samples.
// Nothing is persisted, so a deployment with several replicas keeps one
// registry per process and their estimates can differ - fine for the single
// container Lode ships, but a multi-replica setup would need shared storage.
let registry: EtaTrackerRegistry | null = null

function getRegistry(): EtaTrackerRegistry {
  if (registry === null) registry = createEtaTrackerRegistry()
  return registry
}

export function trackServerEta(downloads: readonly EtaTrackerInput[], nowMs: number = Date.now()): void {
  getRegistry().trackPoll(downloads, nowMs)
}

export function serverEtaFor(dl: EtaTrackerInput, nowMs: number = Date.now()): EtaDisplay {
  return getRegistry().displayFor(dl, nowMs)
}

// Attaches the shared display state to an API row and replaces the raw
// qBittorrent `etaSeconds` with the stabilised server estimate (0 while the
// tracker is still collecting, so clients never fall back to a noisy value).
export function applyServerEta<T extends EtaTrackerInput>(
  dl: T,
  nowMs: number = Date.now()
): T & { etaState: EtaState; etaSeconds: number } {
  const display = serverEtaFor(dl, nowMs)
  return {
    ...dl,
    etaSeconds: display.etaSeconds ?? 0,
    etaState: display.state
  }
}

export function resetServerEtaTracker(): void {
  registry = null
}
