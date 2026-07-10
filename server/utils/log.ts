import { activityLogs } from '#server/database/schema'
import { randomUUID } from 'node:crypto'
import { getHeader } from 'h3'
import type { H3Event } from 'h3'
import { useDb } from '#server/utils/db'
import { resolveIp } from '#server/utils/ip'

export function logActivity(
  event: H3Event,
  options: {
    action: string
    userId?: string
    username?: string
    details?: string
  }
) {
  const db = useDb()
  const ua = getHeader(event, 'user-agent')

  db.insert(activityLogs)
    .values({
      id: randomUUID(),
      userId: options.userId ?? null,
      username: options.username ?? null,
      action: options.action,
      details: options.details ?? null,
      ip: resolveIp(event),
      userAgent: ua !== undefined && ua !== null && ua !== '' ? ua : null,
      createdAt: new Date().toISOString()
    })
    .run()
}
