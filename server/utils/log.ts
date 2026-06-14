import { activityLogs } from '../database/schema'
import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'

function resolveIp(event: H3Event): string | null {
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
