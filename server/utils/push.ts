import webPush from 'web-push'
import { pushSubscriptions } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { createLogger } from '#server/utils/logger'

const log = createLogger('Push')

let vapidConfigured = false

function ensureVapid(): boolean {
  if (vapidConfigured) return true

  const config = useRuntimeConfig()
  const publicKey = config.vapidPublicKey
  const privateKey = config.vapidPrivateKey
  const subject = config.vapidSubject

  if (publicKey === '' || privateKey === '' || subject === '') {
    return false
  }

  webPush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

export function isPushEnabled(): boolean {
  return ensureVapid()
}

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: Record<string, unknown>
): Promise<boolean> {
  if (!ensureVapid()) return false

  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 60 * 60,
      urgency: 'high'
    })
    return true
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      log.info('Push subscription expired, cleaning up')
      return false
    }
    log.error(err instanceof Error ? err : new Error(String(err)), 'Push notification failed')
    return false
  }
}

export async function sendPushToUser(userId: string, payload: Record<string, unknown>): Promise<void> {
  const db = useDb()
  const subs = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).all()

  if (subs.length === 0) return

  for (const sub of subs) {
    const alive = await sendPushNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload
    )

    if (!alive) {
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).run()
    }
  }
}
