import { UNRELIABLE_ETA_SECONDS } from '#shared/eta-tracker'

export { UNRELIABLE_ETA_SECONDS }

export const QBITTORRENT_UNKNOWN_ETA = 24000

export function normalizeEta(eta: number): number {
  if (!Number.isFinite(eta) || eta <= 0) return 0
  if (eta === QBITTORRENT_UNKNOWN_ETA || eta > UNRELIABLE_ETA_SECONDS) return 0
  return Math.round(eta)
}
