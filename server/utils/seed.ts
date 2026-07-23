import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { hash } from '@node-rs/bcrypt'
import { randomUUID } from 'node:crypto'
import { useDbAsync, dbGet, dbRun } from '#server/utils/db'
import { createLogger } from '#server/utils/logger'

const log = createLogger('DB')

export async function ensureAdminExists() {
  const db = await useDbAsync()
  const admin = await dbGet(db.select().from(users).where(eq(users.role, 'admin')))

  if (!admin) {
    const id = randomUUID()
    const password = await hash('admin', 12)

    await dbRun(
      db.insert(users).values({
        id,
        username: 'admin',
        password,
        role: 'admin',
        isActive: true,
        dailyDownloadLimit: 999,
        activeTorrentLimit: 999,
        maxTorrentSizeGb: 999,
        downloadsToday: 0,
        createdAt: new Date().toISOString()
      })
    )

    log.info('Admin user created (username: admin, password: admin)')
  } else if (!admin.isActive) {
    await dbRun(db.update(users).set({ isActive: true }).where(eq(users.id, admin.id)))
    log.info('Admin user re-activated')
  }
}
