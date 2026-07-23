import { getReposAsync } from '#server/repositories'
import { randomUUID } from 'node:crypto'
import { getHeader } from 'h3'
import type { H3Event } from 'h3'
import { resolveIp } from '#server/utils/ip'

export async function logActivity(
  event: H3Event,
  options: {
    action: string
    userId?: string
    username?: string
    details?: string
  }
) {
  const repos = await getReposAsync()
  const ua = getHeader(event, 'user-agent')

  await repos.activityLogs.create({
    id: randomUUID(),
    userId: options.userId ?? null,
    username: options.username ?? null,
    action: options.action,
    details: options.details ?? null,
    ip: resolveIp(event),
    userAgent: ua !== undefined && ua !== null && ua !== '' ? ua : null,
    createdAt: new Date().toISOString()
  })
}
