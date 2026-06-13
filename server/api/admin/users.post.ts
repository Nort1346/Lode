import bcrypt from 'bcrypt'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

interface CreateUserBody {
  username: string
  password: string
  role?: string
  dailyDownloadLimit?: number
  activeTorrentLimit?: number
  maxTorrentSizeGb?: number
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<CreateUserBody>(event)
  const { username, password, role, dailyDownloadLimit, activeTorrentLimit, maxTorrentSizeGb } = body

  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password are required' })
  }

  const db = useDb()
  const existing = db.select().from(users).where(eq(users.username, username)).get()
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Username already exists' })
  }

  const hashedPassword = await bcrypt.hash(password, 12)
  const id = randomUUID()

  db.insert(users)
    .values({
      id,
      username,
      password: hashedPassword,
      role: role === 'user' || role === 'admin' ? role : 'user',
      dailyDownloadLimit: dailyDownloadLimit ?? 5,
      activeTorrentLimit: activeTorrentLimit ?? 3,
      maxTorrentSizeGb: maxTorrentSizeGb ?? 20,
      isActive: true,
      downloadsToday: 0,
      createdAt: new Date().toISOString()
    })
    .run()

  return { success: true, id }
})
