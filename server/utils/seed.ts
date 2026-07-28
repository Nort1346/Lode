import { getReposAsync } from '#server/repositories'
import { hash } from '@node-rs/bcrypt'
import { randomBytes, randomUUID } from 'node:crypto'
import { createLogger } from '#server/utils/logger'

const log = createLogger('DB')

function generateAdminPassword(length = 20): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  const bytes = randomBytes(length)
  let password = ''
  for (let i = 0; i < length; i++) {
    const byte = bytes[i]
    if (byte !== undefined) {
      password += charset[byte % charset.length]
    }
  }
  return password
}

export async function ensureAdminExists() {
  const repos = await getReposAsync()
  const admins = await repos.users.findByRole('admin')

  if (admins.length === 0) {
    const id = randomUUID()
    const adminPassword = generateAdminPassword()
    const password = await hash(adminPassword, 12)

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

    log.info('Admin user created  username: admin')
    log.info(`Admin password: ${adminPassword}`)
    log.info('Change this password after first login!')
  } else {
    const admin = admins[0]
    if (admin !== undefined && !admin.isActive) {
      await repos.users.update(admin.id, { isActive: true })
      log.info('Admin user re-activated')
    }
  }
}
