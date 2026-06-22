import { loginAttempts } from '#server/database/schema'
import { sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'

export interface BruteForceConfig {
  maxAttemptsPerIp: number
  ipBlockDurationMinutes: number
  windowMinutes: number
}

const DEFAULT_CONFIG: BruteForceConfig = {
  maxAttemptsPerIp: 5,
  ipBlockDurationMinutes: 60,
  windowMinutes: 15
}

const blockedIpsCache = new Map<string, number>()
let cleanupInterval: ReturnType<typeof setInterval> | null = null

function startCacheCleanup() {
  if (cleanupInterval !== null) return
  cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [ip, expiresAt] of blockedIpsCache) {
      if (now > expiresAt) {
        blockedIpsCache.delete(ip)
      }
    }
  }, 60_000)
}

export async function getBruteForceConfig(): Promise<BruteForceConfig> {
  const db = useDb()
  try {
    const row = db
      .select({ value: sql<string>`value` })
      .from(sql`(SELECT value FROM settings WHERE key = 'brute_force_config')`)
      .get()
    if (row?.value !== undefined && row.value !== null && row.value !== '') {
      return { ...DEFAULT_CONFIG, ...(JSON.parse(row.value) as Partial<BruteForceConfig>) }
    }
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULT_CONFIG }
}

export async function saveBruteForceConfig(config: Partial<BruteForceConfig>): Promise<void> {
  const db = useDb()
  const existing = db
    .select({ value: sql<string>`value` })
    .from(sql`(SELECT value FROM settings WHERE key = 'brute_force_config')`)
    .get()

  const merged = { ...DEFAULT_CONFIG, ...config }
  if (existing !== undefined && existing !== null) {
    db.run(sql`UPDATE settings SET value = ${JSON.stringify(merged)} WHERE key = 'brute_force_config'`)
  } else {
    db.run(sql`INSERT INTO settings (key, value) VALUES ('brute_force_config', ${JSON.stringify(merged)})`)
  }
}

export async function isIpBlocked(ip: string): Promise<boolean> {
  startCacheCleanup()
  const expiresAt = blockedIpsCache.get(ip)
  if (expiresAt !== undefined) {
    if (Date.now() < expiresAt) return true
    blockedIpsCache.delete(ip)
    return false
  }

  const db = useDb()
  const config = await getBruteForceConfig()
  const windowStart = new Date(Date.now() - config.windowMinutes * 60_000).toISOString()

  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(sql`(SELECT ip FROM login_attempts WHERE ip = ${ip} AND success = 0 AND created_at > ${windowStart})`)
    .get()

  const failedCount = row?.count ?? 0
  if (failedCount >= config.maxAttemptsPerIp) {
    const blockUntil = Date.now() + config.ipBlockDurationMinutes * 60_000
    blockedIpsCache.set(ip, blockUntil)
    return true
  }

  return false
}

export async function recordLoginAttempt(
  event: H3Event,
  options: { username: string; success: boolean }
): Promise<void> {
  const db = useDb()
  const ip = resolveIp(event)
  const ua = getHeader(event, 'user-agent')

  db.insert(loginAttempts)
    .values({
      id: randomUUID(),
      ip: ip ?? 'unknown',
      username: options.username,
      success: options.success,
      userAgent: ua !== undefined && ua !== null && ua !== '' ? ua : null,
      createdAt: new Date().toISOString()
    })
    .run()

  if (options.success || ip === null || ip === '') return

  const config = await getBruteForceConfig()
  const windowStart = new Date(Date.now() - config.windowMinutes * 60_000).toISOString()

  const ipFailedRow = db
    .select({ count: sql<number>`count(*)` })
    .from(sql`(SELECT id FROM login_attempts WHERE ip = ${ip} AND success = 0 AND created_at > ${windowStart})`)
    .get()

  const ipFailedCount = ipFailedRow?.count ?? 0
  if (ipFailedCount >= config.maxAttemptsPerIp) {
    const blockUntil = Date.now() + config.ipBlockDurationMinutes * 60_000
    blockedIpsCache.set(ip, blockUntil)
  }
}

export async function blockIp(ip: string, _reason: string, durationMinutes?: number): Promise<void> {
  const config = await getBruteForceConfig()
  const duration = durationMinutes ?? config.ipBlockDurationMinutes
  const blockUntil = Date.now() + duration * 60_000
  blockedIpsCache.set(ip, blockUntil)

  const db = useDb()
  db.insert(loginAttempts)
    .values({
      id: randomUUID(),
      ip,
      username: null,
      success: false,
      userAgent: null,
      createdAt: new Date().toISOString()
    })
    .run()
}

export async function unblockIp(ip: string): Promise<void> {
  blockedIpsCache.delete(ip)

  const db = useDb()
  db.run(sql`DELETE FROM login_attempts WHERE ip = ${ip} AND success = 0`)
}

export interface BlockedIpEntry {
  ip: string
  expiresAt: number
  attemptsCount: number
}

export async function getBlockedIps(): Promise<BlockedIpEntry[]> {
  startCacheCleanup()
  const entries: BlockedIpEntry[] = []
  const db = useDb()
  const config = await getBruteForceConfig()
  const windowStart = new Date(Date.now() - config.windowMinutes * 60_000).toISOString()

  for (const [ip, expiresAt] of blockedIpsCache) {
    if (Date.now() >= expiresAt) {
      blockedIpsCache.delete(ip)
      continue
    }
    const row = db
      .select({ count: sql<number>`count(*)` })
      .from(sql`(SELECT id FROM login_attempts WHERE ip = ${ip} AND success = 0 AND created_at > ${windowStart})`)
      .get()
    entries.push({ ip, expiresAt, attemptsCount: row?.count ?? 0 })
  }

  return entries.sort((a, b) => b.expiresAt - a.expiresAt)
}

export interface BruteForceStats {
  blockedIpsCount: number
  recentAttempts24h: number
  recentFailed24h: number
  recentSuccess24h: number
}

export async function getBruteForceStats(): Promise<BruteForceStats> {
  startCacheCleanup()
  const db = useDb()
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString()

  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(sql`(SELECT id FROM login_attempts WHERE created_at > ${since24h})`)
    .get()
  const failedRow = db
    .select({ count: sql<number>`count(*)` })
    .from(sql`(SELECT id FROM login_attempts WHERE success = 0 AND created_at > ${since24h})`)
    .get()
  const successRow = db
    .select({ count: sql<number>`count(*)` })
    .from(sql`(SELECT id FROM login_attempts WHERE success = 1 AND created_at > ${since24h})`)
    .get()

  let blockedIpsCount = 0
  for (const [, expiresAt] of blockedIpsCache) {
    if (Date.now() < expiresAt) blockedIpsCount++
  }

  return {
    blockedIpsCount,
    recentAttempts24h: totalRow?.count ?? 0,
    recentFailed24h: failedRow?.count ?? 0,
    recentSuccess24h: successRow?.count ?? 0
  }
}

export async function cleanupOldAttempts(): Promise<void> {
  const db = useDb()
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()
  db.run(sql`DELETE FROM login_attempts WHERE created_at < ${cutoff}`)
}

export function resolveIp(event: H3Event): string | null {
  const cf = getHeader(event, 'cf-connecting-ip')
  if (cf !== undefined && cf !== null && cf !== '') return cf

  const forwarded = getHeader(event, 'x-forwarded-for')
  if (forwarded !== undefined && forwarded !== null && forwarded !== '') {
    const first = forwarded.split(',')[0]
    if (first !== undefined) return first.trim()
  }

  const realIp = getHeader(event, 'x-real-ip')
  if (realIp !== undefined && realIp !== null && realIp !== '') return realIp

  return null
}
