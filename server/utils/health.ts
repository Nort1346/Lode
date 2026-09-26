import type { ServiceStatus } from '#server/types/admin'
import type { ProwlarrIndexer, ProwlarrIndexerStatus } from '#server/types/prowlarr'
import { normalizeUrl } from '#server/utils/url'
import { resolveTmdbApiKey } from '#server/utils/tmdb'

// Per-check budget: a dead service must not stall the whole status response.
const CHECK_TIMEOUT_MS = 5000

export async function checkQbittorrent(config: ReturnType<typeof useRuntimeConfig>): Promise<ServiceStatus> {
  const url = config.qbittorrentUrl as string
  const apiKey = config.qbittorrentApiKey as string
  if (!url || !apiKey) {
    return { name: 'qBittorrent', configured: false, status: 'not_configured' }
  }

  const start = Date.now()
  const base = normalizeUrl(url)
  try {
    // app/version answers 403 "Forbidden" without auth when the WebUI
    // requires it, so the API key is sent and the body is only used when ok
    const [versionResult, authResult] = await Promise.allSettled([
      fetch(`${base}/api/v2/app/version`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
      }).then(async (res) => (res.ok ? res.text() : '')),
      fetch(`${base}/api/v2/app/preferences`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
      })
    ])

    const latencyMs = Date.now() - start
    if (authResult.status === 'rejected') {
      return { name: 'qBittorrent', configured: true, status: 'down', latencyMs }
    }
    if (authResult.value.status === 401 || authResult.value.status === 403) {
      return { name: 'qBittorrent', configured: true, status: 'invalid', latencyMs, details: 'API key rejected' }
    }
    if (!authResult.value.ok) {
      return { name: 'qBittorrent', configured: true, status: 'down', latencyMs }
    }
    const rawVersion = versionResult.status === 'fulfilled' ? versionResult.value.trim() : ''
    // app/version may answer with or without the leading "v"
    const version = rawVersion.replace(/^v/i, '')
    return {
      name: 'qBittorrent',
      configured: true,
      status: 'up',
      latencyMs,
      details: version.length > 0 ? `v${version}` : undefined
    }
  } catch {
    return {
      name: 'qBittorrent',
      configured: true,
      status: 'down',
      latencyMs: Date.now() - start
    }
  }
}

// /api/v1/indexerstatus lists only indexers Prowlarr has disabled in the
// background after repeated failures. A failed or unparseable response means
// "nothing known to be blocked", not "everything is broken".
async function readBlockedIndexerIds(result: PromiseSettledResult<Response>): Promise<Set<number>> {
  if (result.status !== 'fulfilled' || !result.value.ok) return new Set()
  try {
    const data: unknown = await result.value.json()
    if (!Array.isArray(data)) return new Set()
    const ids = new Set<number>()
    for (const item of data) {
      if (typeof item !== 'object' || item === null) continue
      const { indexerId } = item as ProwlarrIndexerStatus
      if (typeof indexerId === 'number') ids.add(indexerId)
    }
    return ids
  } catch {
    return new Set()
  }
}

export async function checkProwlarr(config: ReturnType<typeof useRuntimeConfig>): Promise<ServiceStatus> {
  const url = config.prowlarrUrl as string
  const apiKey = config.prowlarrApiKey as string
  if (!url || !apiKey) {
    return { name: 'Prowlarr', configured: false, status: 'not_configured' }
  }

  const start = Date.now()
  const base = normalizeUrl(url)
  try {
    // system/status requires the API key, unlike /health. The indexer list
    // (singular /api/v1/indexer - the plural route 404s) and the
    // background-disabled list (/api/v1/indexerstatus) are fetched in parallel
    // so a dead service still resolves within the single timeout budget.
    // A running Prowlarr with zero usable indexers is as broken for search as
    // an offline one, so it is reported as its own condition.
    const [statusResult, indexersResult, indexerStatusResult] = await Promise.allSettled([
      fetch(`${base}/api/v1/system/status?apikey=${apiKey}`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) }),
      fetch(`${base}/api/v1/indexer?apikey=${apiKey}`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) }),
      fetch(`${base}/api/v1/indexerstatus?apikey=${apiKey}`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
    ])

    const latencyMs = Date.now() - start
    if (statusResult.status === 'rejected') {
      return { name: 'Prowlarr', configured: true, status: 'down', latencyMs }
    }
    if (statusResult.value.status === 401) {
      return {
        name: 'Prowlarr',
        configured: true,
        status: 'invalid',
        latencyMs,
        details: 'API key rejected'
      }
    }
    if (!statusResult.value.ok) throw new Error(`HTTP ${statusResult.value.status}`)

    // -1 means the list could not be read; only a successfully parsed list
    // can ever produce no_indexers.
    let usableIndexers = -1
    let enabledIndexers = 0
    if (indexersResult.status === 'fulfilled' && indexersResult.value.ok) {
      try {
        const data: unknown = await indexersResult.value.json()
        if (Array.isArray(data)) {
          const blockedIds = await readBlockedIndexerIds(indexerStatusResult)
          let enabled = 0
          let usable = 0
          for (const item of data) {
            if (typeof item !== 'object' || item === null) continue
            const { id, enable } = item as ProwlarrIndexer
            if (enable !== true) continue
            enabled += 1
            // An enabled indexer counts as usable unless it is known to be
            // disabled in the background; without an id it cannot be matched
            // against the blocked list.
            if (typeof id !== 'number' || !blockedIds.has(id)) usable += 1
          }
          enabledIndexers = enabled
          usableIndexers = usable
        }
      } catch {
        // Unparseable indexer list: reachability is already proven, so
        // report up rather than a false no_indexers alarm
      }
    }

    if (usableIndexers === 0) {
      return {
        name: 'Prowlarr',
        configured: true,
        status: 'no_indexers',
        latencyMs,
        details: enabledIndexers === 0 ? 'No enabled indexers' : 'All enabled indexers are disabled by Prowlarr'
      }
    }

    return { name: 'Prowlarr', configured: true, status: 'up', latencyMs }
  } catch {
    return {
      name: 'Prowlarr',
      configured: true,
      status: 'down',
      latencyMs: Date.now() - start
    }
  }
}

export async function checkTmdb(_config: ReturnType<typeof useRuntimeConfig>): Promise<ServiceStatus> {
  // TMDB always has a key: the user's NUXT_TMDB_API_KEY or the built-in shared key.
  const apiKey = resolveTmdbApiKey()

  const start = Date.now()
  try {
    const url = new URL('https://api.themoviedb.org/3/configuration')
    url.searchParams.set('api_key', apiKey)
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
    if (res.status === 401) {
      return {
        name: 'TMDB',
        configured: true,
        status: 'invalid',
        latencyMs: Date.now() - start,
        details: 'API key rejected by TMDB'
      }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return {
      name: 'TMDB',
      configured: true,
      status: 'up',
      latencyMs: Date.now() - start,
      details: 'API key valid'
    }
  } catch {
    return {
      name: 'TMDB',
      configured: true,
      status: 'down',
      latencyMs: Date.now() - start
    }
  }
}

// The services a regular user's session depends on, checked in parallel.
export async function checkCoreServices(config: ReturnType<typeof useRuntimeConfig>): Promise<ServiceStatus[]> {
  return Promise.all([checkTmdb(config), checkProwlarr(config), checkQbittorrent(config)])
}
