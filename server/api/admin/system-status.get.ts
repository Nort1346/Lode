import type { H3Event } from 'h3'
import { sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import Redis from 'ioredis'
import type { ServiceStatus } from '#server/types/admin'
import { useDbAsync } from '#server/utils/db'
import { createLogger } from '#server/utils/logger'
import { normalizeUrl } from '#server/utils/url'

const log = createLogger('SystemStatus')

async function checkQbittorrent(config: ReturnType<typeof useRuntimeConfig>): Promise<ServiceStatus> {
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
        signal: AbortSignal.timeout(5000)
      }).then(async (res) => (res.ok ? res.text() : '')),
      fetch(`${base}/api/v2/app/preferences`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000)
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

async function checkProwlarr(config: ReturnType<typeof useRuntimeConfig>): Promise<ServiceStatus> {
  const url = config.prowlarrUrl as string
  const apiKey = config.prowlarrApiKey as string
  if (!url || !apiKey) {
    return { name: 'Prowlarr', configured: false, status: 'not_configured' }
  }

  const start = Date.now()
  try {
    // system/status requires the API key, unlike /health
    const res = await fetch(`${normalizeUrl(url)}/api/v1/system/status?apikey=${apiKey}`, {
      signal: AbortSignal.timeout(5000)
    })
    if (res.status === 401) {
      return {
        name: 'Prowlarr',
        configured: true,
        status: 'invalid',
        latencyMs: Date.now() - start,
        details: 'API key rejected'
      }
    }
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
  const apiKey = (config.jellyfinApiKey as string) || ''
  if (!url) {
    return { name: 'Jellyfin', configured: false, status: 'not_configured' }
  }

  const start = Date.now()
  try {
    // With an API key, System/Info verifies it; without one, fall back
    // to the public endpoint (reachability only)
    const res = apiKey
      ? await fetch(`${normalizeUrl(url)}/System/Info`, {
          headers: { 'X-Emby-Token': apiKey },
          signal: AbortSignal.timeout(5000)
        })
      : await fetch(`${normalizeUrl(url)}/System/Info/Public`, {
          signal: AbortSignal.timeout(5000)
        })
    if (res.status === 401) {
      return {
        name: 'Jellyfin',
        configured: true,
        status: 'invalid',
        latencyMs: Date.now() - start,
        details: 'API key rejected'
      }
    }
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
    if (res.status === 404) {
      return {
        name: 'Discord',
        configured: true,
        status: 'invalid',
        latencyMs: Date.now() - start,
        details: 'Webhook not found'
      }
    }
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

async function checkTmdb(config: ReturnType<typeof useRuntimeConfig>): Promise<ServiceStatus> {
  const apiKey = (config.tmdbApiKey as string) || ''
  if (!apiKey) {
    return { name: 'TMDB', configured: false, status: 'not_configured', details: 'NUXT_TMDB_API_KEY missing' }
  }

  const start = Date.now()
  try {
    const url = new URL('https://api.themoviedb.org/3/configuration')
    url.searchParams.set('api_key', apiKey)
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) })
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

async function checkDatabase(): Promise<ServiceStatus> {
  const driver = (process.env.DB_DRIVER ?? 'sqlite').toLowerCase()
  const name = driver === 'postgres' ? 'PostgreSQL' : 'SQLite'
  const start = Date.now()
  try {
    const db = await useDbAsync()
    let version: string | undefined
    if (driver === 'postgres') {
      const pg = db as unknown as PostgresJsDatabase
      const rows = await pg.execute<{ v: string }>(sql`select current_setting('server_version') as v`)
      version = rows[0]?.v
    } else {
      const row = db.get<{ v: string } | undefined>(sql`select sqlite_version() as v`)
      version = row?.v
    }
    return { name, configured: true, status: 'up', latencyMs: Date.now() - start, details: version }
  } catch (error) {
    log.error(error, 'database status check failed')
    return { name, configured: true, status: 'down', latencyMs: Date.now() - start }
  }
}

export default defineEventHandler(async (event: H3Event) => {
  await requireAdmin(event)

  const config = useRuntimeConfig()

  const services = await Promise.all([
    checkQbittorrent(config),
    checkProwlarr(config),
    checkJellyfin(config),
    checkTmdb(config),
    checkRedis(config),
    checkDiscord(config),
    checkFlareSolverr(config),
    checkDatabase()
  ])

  return { services }
})
