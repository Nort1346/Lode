import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcrypt'
import { randomUUID } from 'node:crypto'
import { createLogger } from '#server/utils/logger'

const log = createLogger('DB')

export async function ensureAdminExists() {
  const db = useDb()
  const admin = db.select().from(users).where(eq(users.role, 'admin')).get()

  if (!admin) {
    const id = randomUUID()
    const password = await bcrypt.hash('admin', 12)

    db.insert(users)
      .values({
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
      .run()

    log.info('Admin user created (username: admin, password: admin)')
  }
}
