import type { H3Event } from 'h3'
import Redis from 'ioredis'

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

interface ServiceStatus {
  name: string
  configured: boolean
  status: 'up' | 'down' | 'not_configured'
  latencyMs?: number
  details?: string
}

async function checkQbittorrent(config: ReturnType<typeof useRuntimeConfig>): Promise<ServiceStatus> {
  const url = config.qbittorrentUrl as string
  const apiKey = config.qbittorrentApiKey as string
  if (!url || !apiKey) {
    return { name: 'qBittorrent', configured: false, status: 'not_configured' }
  }

  const start = Date.now()
  try {
    const res = await fetch(`${normalizeUrl(url)}/api/v2/app/version`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const version = await res.text()
    const trimmed = version.trim()
    return {
      name: 'qBittorrent',
      configured: true,
      status: 'up',
      latencyMs: Date.now() - start,
      details: trimmed.length > 0 ? `v${trimmed}` : undefined
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

async function checkProwlarr(config: ReturnType<typeof useRuntimeConfig>): Promise<ServiceStatus> {
  const url = config.prowlarrUrl as string
  const apiKey = config.prowlarrApiKey as string
  if (!url || !apiKey) {
    return { name: 'Prowlarr', configured: false, status: 'not_configured' }
  }

  const start = Date.now()
  try {
    const res = await fetch(`${normalizeUrl(url)}/api/v1/health?apikey=${apiKey}`, {
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return {
      name: 'Prowlarr',
      configured: true,
      status: 'up',
      latencyMs: Date.now() - start
    }
  } catch {
    return {
      name: 'Prowlarr',
      configured: true,
      status: 'down',
      latencyMs: Date.now() - start
    }
  }
}

async function checkJellyfin(config: ReturnType<typeof useRuntimeConfig>): Promise<ServiceStatus> {
  const url = config.jellyfinUrl as string
  if (!url) {
    return { name: 'Jellyfin', configured: false, status: 'not_configured' }
  }

  const start = Date.now()
  try {
    const res = await fetch(`${normalizeUrl(url)}/System/Info/Public`, {
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { Version?: string }
    return {
      name: 'Jellyfin',
      configured: true,
      status: 'up',
      latencyMs: Date.now() - start,
      details: data.Version ?? undefined
    }
  } catch {
    return {
      name: 'Jellyfin',
      configured: true,
      status: 'down',
      latencyMs: Date.now() - start
    }
  }
}

async function checkDiscord(config: ReturnType<typeof useRuntimeConfig>): Promise<ServiceStatus> {
  const webhookUrl = config.discordWebhookUrl as string
  if (!webhookUrl) {
    return { name: 'Discord', configured: false, status: 'not_configured' }
  }

  const start = Date.now()
  try {
    const res = await fetch(`${webhookUrl}?wait=${Date.now()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return {
      name: 'Discord',
      configured: true,
      status: 'up',
      latencyMs: Date.now() - start
    }
  } catch {
    return {
      name: 'Discord',
      configured: true,
      status: 'down',
      latencyMs: Date.now() - start
    }
  }
}

async function checkFlareSolverr(config: ReturnType<typeof useRuntimeConfig>): Promise<ServiceStatus> {
  const url = config.flaresolverrUrl as string
  if (!url) {
    return { name: 'FlareSolverr', configured: false, status: 'not_configured' }
  }

  const start = Date.now()
  try {
    const res = await fetch(normalizeUrl(url), { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return {
      name: 'FlareSolverr',
      configured: true,
      status: 'up',
      latencyMs: Date.now() - start
    }
  } catch {
    return {
      name: 'FlareSolverr',
      configured: true,
      status: 'down',
      latencyMs: Date.now() - start
    }
  }
}

async function checkRedis(config: ReturnType<typeof useRuntimeConfig>): Promise<ServiceStatus> {
  const url = config.redisUrl as string
  if (!url) {
    return { name: 'Redis', configured: false, status: 'not_configured' }
  }

  const start = Date.now()
  let client: Redis | null = null
  try {
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
      enableOfflineQueue: false
    })
    await client.connect()
    const pong = await client.ping()
    return {
      name: 'Redis',
      configured: true,
      status: pong === 'PONG' ? 'up' : 'down',
      latencyMs: Date.now() - start
    }
  } catch {
    return {
      name: 'Redis',
      configured: true,
      status: 'down',
      latencyMs: Date.now() - start
    }
  } finally {
    client?.disconnect()
  }
}

export default defineEventHandler(async (event: H3Event) => {
  await requireAdmin(event)

  const config = useRuntimeConfig()

  const services = await Promise.all([
    checkQbittorrent(config),
    checkProwlarr(config),
    checkJellyfin(config),
    checkRedis(config),
    checkDiscord(config),
    checkFlareSolverr(config)
  ])

  return { services }
})
