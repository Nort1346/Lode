import { getReposAsync } from '#server/repositories'
import { hash } from '@node-rs/bcrypt'
import { randomUUID } from 'node:crypto'
import { createLogger } from '#server/utils/logger'

const log = createLogger('DB')

export async function ensureAdminExists() {
  const repos = await getReposAsync()
  const admins = await repos.users.findByRole('admin')

  if (admins.length === 0) {
    const id = randomUUID()
    const password = await hash('admin', 12)

    await repos.users.create({
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

    log.info('Admin user created (username: admin, password: admin)')
  } else {
    const admin = admins[0]
    if (admin !== undefined && !admin.isActive) {
      await repos.users.update(admin.id, { isActive: true })
      log.info('Admin user re-activated')
    }
  }
}
