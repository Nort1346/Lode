import { computed, onMounted, ref } from 'vue'
import type { ServiceStatus } from '~/types/settings'

export type CoreServiceKey = 'tmdb' | 'prowlarr' | 'qbittorrent'

export type ServiceIssueKind =
  | 'prowlarr-down'
  | 'prowlarr-invalid'
  | 'prowlarr-no-indexers'
  | 'prowlarr-setup'
  | 'qbittorrent-down'
  | 'qbittorrent-invalid'
  | 'qbittorrent-setup'

// A check older than this triggers a fresh fetch; results are also shared
// across navigation so moving between pages never re-checks (or re-flickers).
const HEALTH_TTL_MS = 30_000

// Module-level so concurrent components (layout + page) share one in-flight
// request instead of racing two fetches.
let inFlight: Promise<void> | null = null

interface ServiceHealthState {
  tmdb: ServiceStatus | null
  prowlarr: ServiceStatus | null
  qbittorrent: ServiceStatus | null
  checkedAt: number
}

export function useServiceHealth() {
  const state = useState<ServiceHealthState>('service-health', () => ({
    tmdb: null,
    prowlarr: null,
    qbittorrent: null,
    checkedAt: 0
  }))

  // Banner dismissal is per issue kind, so a status change (e.g. down ->
  // no_indexers) is a new kind and resurfaces on its own.
  const dismissed = useState<Record<ServiceIssueKind, boolean>>('service-health-dismissed', () => {
    return {} as Record<ServiceIssueKind, boolean>
  })

  const tmdb = computed(() => state.value.tmdb)
  const prowlarr = computed(() => state.value.prowlarr)
  const qbittorrent = computed(() => state.value.qbittorrent)

  // Whether the first check has resolved - banners render only after this so
  // a pending check never causes a layout placeholder.
  const checked = computed(() => state.value.checkedAt > 0)

  const tmdbBlocked = computed(() => state.value.tmdb?.status === 'down' || state.value.tmdb?.status === 'invalid')

  // A missing download client is a hard stop too: the download endpoints
  // cannot work without one, so it blocks the same way as a dead one.
  const qbittorrentBlocked = computed(
    () =>
      state.value.qbittorrent?.status === 'down' ||
      state.value.qbittorrent?.status === 'invalid' ||
      state.value.qbittorrent?.status === 'not_configured'
  )

  const issues = computed<ServiceIssueKind[]>(() => {
    const out: ServiceIssueKind[] = []
    const p = state.value.prowlarr
    if (p) {
      if (p.status === 'down') out.push('prowlarr-down')
      else if (p.status === 'invalid') out.push('prowlarr-invalid')
      else if (p.status === 'no_indexers') out.push('prowlarr-no-indexers')
      else if (p.status === 'not_configured') out.push('prowlarr-setup')
    }
    const q = state.value.qbittorrent
    if (q) {
      if (q.status === 'down') out.push('qbittorrent-down')
      else if (q.status === 'invalid') out.push('qbittorrent-invalid')
      else if (q.status === 'not_configured') out.push('qbittorrent-setup')
    }
    return out
  })

  const retrying = ref(false)

  async function refresh(force = false): Promise<void> {
    if (import.meta.server) return
    if (retrying.value) return
    if (!force && state.value.checkedAt > 0 && Date.now() - state.value.checkedAt < HEALTH_TTL_MS) return
    if (inFlight) return inFlight

    retrying.value = true
    inFlight = (async () => {
      try {
        const data = await $fetch<{ services: ServiceStatus[] }>('/api/health/services')
        const byName = new Map(data.services.map((s) => [s.name, s]))
        state.value.tmdb = byName.get('TMDB') ?? null
        state.value.prowlarr = byName.get('Prowlarr') ?? null
        state.value.qbittorrent = byName.get('qBittorrent') ?? null
        state.value.checkedAt = Date.now()
      } catch {
        // A failed health check is not itself an outage signal: keep the
        // previous state (or "unknown") so one flaky request cannot raise
        // false alarms or clear real ones.
      } finally {
        retrying.value = false
        inFlight = null
      }
    })()
    await inFlight
  }

  function ensure(): Promise<void> {
    if (import.meta.server) return Promise.resolve()
    return refresh(false)
  }

  function retry(): Promise<void> {
    return refresh(true)
  }

  function dismiss(kind: ServiceIssueKind) {
    dismissed.value[kind] = true
  }

  onMounted(() => {
    void refresh(false)
  })

  return {
    tmdb,
    prowlarr,
    qbittorrent,
    checked,
    retrying,
    tmdbBlocked,
    qbittorrentBlocked,
    issues,
    dismissed,
    refresh,
    ensure,
    retry,
    dismiss
  }
}
