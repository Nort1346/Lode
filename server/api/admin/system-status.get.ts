import type { H3Event } from 'h3'
import { sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import Redis from 'ioredis'
import type { ServiceStatus } from '#server/types/admin'
import { checkJellyfinStatus } from '#server/utils/clients/jellyfin'
import { checkQbittorrent, checkProwlarr, checkTmdb } from '#server/utils/health'
import { useDbAsync } from '#server/utils/db'
import { createLogger } from '#server/utils/logger'
import { normalizeUrl } from '#server/utils/url'

const log = createLogger('SystemStatus')

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
    checkJellyfinStatus(),
    checkTmdb(config),
    checkRedis(config),
    checkDiscord(config),
    checkFlareSolverr(config),
    checkDatabase()
  ])

  return { services }
})
