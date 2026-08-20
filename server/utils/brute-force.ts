import { loginAttempts } from '#server/database/schema'
import { eq, and, gt, count } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import type { BruteForceConfig, BlockedIpEntry, BruteForceStats } from '#server/types/brute-force'
import { SETTINGS } from '#server/types/settings'
import { resolveIp } from '#server/utils/ip'
import { getSetting, putSetting } from '#server/utils/settings'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'
import { getReposAsync } from '#server/repositories'

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
  try {
    const value = await getSetting(SETTINGS.BRUTE_FORCE_CONFIG)
    if (value !== undefined && value !== '') {
      return { ...DEFAULT_CONFIG, ...(JSON.parse(value) as Partial<BruteForceConfig>) }
    }
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULT_CONFIG }
}

export async function saveBruteForceConfig(config: Partial<BruteForceConfig>): Promise<void> {
  const merged = { ...DEFAULT_CONFIG, ...config }
  await putSetting(SETTINGS.BRUTE_FORCE_CONFIG, JSON.stringify(merged))
}

export async function isIpBlocked(ip: string): Promise<boolean> {
  startCacheCleanup()
  const expiresAt = blockedIpsCache.get(ip)
  if (expiresAt !== undefined) {
    if (Date.now() < expiresAt) return true
    blockedIpsCache.delete(ip)
    return false
  }

  const db = await useDbAsync()
  const config = await getBruteForceConfig()
  const windowStart = new Date(Date.now() - config.windowMinutes * 60_000).toISOString()

  const row = await dbGet(
    db
      .select({ cnt: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, windowStart)))
  )

  const failedCount = row?.cnt ?? 0
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
  const db = await useDbAsync()
  const ip = resolveIp(event)
  const ua = getHeader(event, 'user-agent')

  await dbRun(
    db.insert(loginAttempts).values({
      id: randomUUID(),
      ip: ip ?? 'unknown',
      username: options.username,
      success: options.success,
      userAgent: ua !== undefined && ua !== null && ua !== '' ? ua : null,
      createdAt: new Date().toISOString()
    })
  )

  if (options.success || ip === null || ip === '') return

  const config = await getBruteForceConfig()
  const windowStart = new Date(Date.now() - config.windowMinutes * 60_000).toISOString()

  const ipFailedRow = await dbGet(
    db
      .select({ cnt: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, windowStart)))
  )

  const ipFailedCount = ipFailedRow?.cnt ?? 0
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

  const db = await useDbAsync()
  await dbRun(
    db.insert(loginAttempts).values({
      id: randomUUID(),
      ip,
      username: null,
      success: false,
      userAgent: null,
      createdAt: new Date().toISOString()
    })
  )
}

export async function unblockIp(ip: string): Promise<void> {
  blockedIpsCache.delete(ip)

  const db = await useDbAsync()
  await dbRun(db.delete(loginAttempts).where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false))))
}

export async function getBlockedIps(): Promise<BlockedIpEntry[]> {
  startCacheCleanup()
  const entries: BlockedIpEntry[] = []
  const db = await useDbAsync()
  const config = await getBruteForceConfig()
  const windowStart = new Date(Date.now() - config.windowMinutes * 60_000).toISOString()

  for (const [ip, expiresAt] of blockedIpsCache) {
    if (Date.now() >= expiresAt) {
      blockedIpsCache.delete(ip)
      continue
    }
    const row = await dbGet(
      db
        .select({ cnt: count() })
        .from(loginAttempts)
        .where(
          and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, windowStart))
        )
    )
    entries.push({ ip, expiresAt, attemptsCount: row?.cnt ?? 0 })
  }

  return entries.sort((a, b) => b.expiresAt - a.expiresAt)
}

export async function getBruteForceStats(): Promise<BruteForceStats> {
  startCacheCleanup()
  const db = await useDbAsync()
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString()

  const totalRow = await dbGet(
    db.select({ cnt: count() }).from(loginAttempts).where(gt(loginAttempts.createdAt, since24h))
  )
  const failedRow = await dbGet(
    db
      .select({ cnt: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since24h)))
  )
  const successRow = await dbGet(
    db
      .select({ cnt: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.success, true), gt(loginAttempts.createdAt, since24h)))
  )

  let blockedIpsCount = 0
  for (const [, expiresAt] of blockedIpsCache) {
    if (Date.now() < expiresAt) blockedIpsCount++
  }

  return {
    blockedIpsCount,
    recentAttempts24h: totalRow?.cnt ?? 0,
    recentFailed24h: failedRow?.cnt ?? 0,
    recentSuccess24h: successRow?.cnt ?? 0
  }
}

export async function cleanupOldAttempts(): Promise<void> {
  const repos = await getReposAsync()
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()
  await repos.loginAttempts.deleteOlderThan(cutoff)
}
