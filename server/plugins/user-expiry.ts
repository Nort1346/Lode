import { users } from '#server/database/schema'
import { and, eq, lte, isNotNull } from 'drizzle-orm'
import { syncUserDisable } from '#server/utils/sync'
import { createLogger } from '#server/utils/logger'
import { useDbAsync, dbAll, dbRun } from '#server/utils/db'

const log = createLogger('UserExpiry')

const INTERVAL_MS = 15 * 60 * 1000

export default defineNitroPlugin((nitroApp) => {
  log.info('starting user expiry checker (every 15 minutes)')

  const interval = setInterval(() => {
    void (async () => {
      try {
        const db = await useDbAsync()
        const now = new Date().toISOString()

        const expired = await dbAll(
          db
            .select({ id: users.id, username: users.username })
            .from(users)
            .where(
              and(
                isNotNull(users.expiresAt),
                lte(users.expiresAt, now),
                eq(users.isActive, true),
                eq(users.role, 'user')
              )
            )
        )

        if (expired.length === 0) return

        for (const user of expired) {
          try {
            await dbRun(db.update(users).set({ isActive: false }).where(eq(users.id, user.id)))
            await syncUserDisable(user.id)
            log.info(`user "${user.username}" (${user.id}) deactivated — expired`)
          } catch (err) {
            log.error(err, `failed to deactivate expired user "${user.username}" (${user.id})`)
          }
        }
      } catch (err) {
        log.error(err, 'user expiry check failed')
      }
    })()
  }, INTERVAL_MS)

  nitroApp.hooks.hook('close', () => {
    clearInterval(interval)
    log.info('user expiry checker stopped')
  })
})
